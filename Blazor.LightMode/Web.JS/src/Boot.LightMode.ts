// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

import { renderBatch, attachRootComponentToLogicalElement } from './Rendering/Renderer';
import {WebRendererId} from "./Rendering/WebRendererId";
import {OutOfProcessRenderBatch} from "./Rendering/RenderBatch/OutOfProcessRenderBatch";
import {toLogicalElement} from "./Rendering/LogicalElements";
import {attachWebRendererInterop} from "./Rendering/WebRendererInteropMethods";
import {DotNet} from "@microsoft/dotnet-js-interop";
import {Blazor} from "./GlobalExports";

import JSCallResultType = DotNet.JSCallResultType;
import DotNetObject = DotNet.DotNetObject;
import createJSObjectReference = DotNet.createJSObjectReference;
import createJSStreamReference = DotNet.createJSStreamReference;
import JsonReviver = DotNet.JsonReviver;

function boot() {
    const initScript = document.getElementById('blazor-initialization');

    if (initScript) {
        // @ts-ignore
        const initializationJson = initScript.textContent.trim();
        initScript.remove();

        Blazor._internal.navigationManager.enableNavigationInterception(WebRendererId.Server);
        Blazor._internal.navigationManager.listenForNavigationEvents(WebRendererId.Server, (uri: string, state: string | undefined, intercepted: boolean): Promise<void> => {
            console.log("locationChanged", uri, state, intercepted);
            return locationChanged(uri, intercepted); 
        }, (callId: number, uri: string, state: string | undefined, intercepted: boolean): Promise<void> => {
            console.log("locationChanging", callId, uri, state, intercepted);
            return new Promise<void>((resolve, reject) => {});
        });

        const documentRoot = document.getRootNode();
        const html = (documentRoot as Element).children[0];
        const fragment = document.createDocumentFragment();
        
        fragment.appendChild(html);

        attachRootComponentToLogicalElement(WebRendererId.Server, toLogicalElement(fragment, true), 0, false);

        const response = JSON.parse(initializationJson) as LightModeResponse;
                
        for (const batch of response.serializedRenderBatches)
            renderSerializedRenderBatch(batch);

        let htmlNew = (fragment as unknown as Element).children[0];
        documentRoot.appendChild(htmlNew);

        const interopMethods = {
            serializeAsArg() { return { ["__dotNetObject"]: 0 }; },
            dispose(): void {},
            invokeMethod: invokeMethodLightMode,
            invokeMethodAsync: invokeMethodAsyncLightMode
        } as unknown as DotNetObject;

        attachWebRendererInterop(WebRendererId.Server, interopMethods, undefined, undefined);
        
        for (const invokeJsInfo of response.invokeJsInfos)
            beginInvokeJSFromDotNet(invokeJsInfo.taskId, invokeJsInfo.identifier, invokeJsInfo.argsJson, invokeJsInfo.resultType, invokeJsInfo.targetInstanceId);

        onAfterRender();
    }
}

let requestId = "";
const jsonRevivers: JsonReviver[] = [];
window['DotNet'] = DotNet;

document.addEventListener("DOMContentLoaded", function(event) {
    if (window["__lightmode_initialized"])
        return;
    
    window["__lightmode_initialized"] = true;
    
    const commentNodes = document.getRootNode().childNodes;
    for (let i = commentNodes.length - 1; i >= 0; i--) {
        const commentNode = commentNodes[i];
        if (commentNode.nodeType === Node.COMMENT_NODE) {
            requestId = commentNode.nodeValue!.substring(10);
            console.log("requestId", requestId);
            break;
        }
    }

    boot();
});

function renderSerializedRenderBatch(serializedRenderBatch: string) {
    const binaryBatch = base64ToUint8Array(serializedRenderBatch);
    renderBatch(WebRendererId.Server, new OutOfProcessRenderBatch(binaryBatch));
}

function invokeMethodLightMode<T>(methodIdentifier: string, ...args: any[]): T {
    console.log("invokeMethodLightMode", methodIdentifier, args);
    return null as T;
}
function invokeMethodAsyncLightMode<T>(methodIdentifier: string, ...args: any[]): Promise<T> {
    return new Promise<T>(async (resolve, reject) => {
        return await circuitFetch(`_invokeMethodAsync`, {
            RequestId: requestId,
            AssemblyName: null,
            MethodIdentifier: methodIdentifier,
            ObjectReference: 0,
            Arguments: args
        });
    });
}

function locationChanged(uri: string, intercepted: boolean): Promise<void> {
    return circuitFetch(`_locationChanged`, {
        RequestId: requestId,
        Location: uri,
    });
}

function onAfterRender(): Promise<void> {
    return circuitFetch(`_onAfterRender`, {
        RequestId: requestId,
    });
}

function endInvokeJSFromDotNet(identifier: string, asyncHandle: number, success: boolean, result: string): Promise<void> {
    console.log("endInvokeJSFromDotNet", identifier, asyncHandle, success, result);
    return circuitFetch(`_endInvokeJSFromDotNet`, {
        RequestId: requestId,
        AsyncHandle: asyncHandle,
        Success: success,
        Result: result
    });
}

function circuitFetch(uri: string, body: any): Promise<void> {
    console.log("circuitFetch", uri, body);
    return new Promise<void>((resolve, reject) => {
        fetch(uri, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        }).then(async response => {
            let lightModeResponse = await response.json() as LightModeResponse;
            await handleResponse(lightModeResponse);
        }).catch(error => {
            console.error(uri + " error", error);
            reject(error);
        });
    });
}

async function handleResponse(response: LightModeResponse) {
    console.log("Handling response", response);
    
    for (const batch of response.serializedRenderBatches)
        renderSerializedRenderBatch(batch);
    
    for (const invokeJsInfo of response.invokeJsInfos)
        beginInvokeJSFromDotNet(invokeJsInfo.taskId, invokeJsInfo.identifier, invokeJsInfo.argsJson, invokeJsInfo.resultType, invokeJsInfo.targetInstanceId);        

    if (response.serializedRenderBatches.length > 0 || !response.renderCompleted)
        await onAfterRender();
}

function base64ToUint8Array(base64: string) {
    const binaryString = atob(base64);
    const binaryLength = binaryString.length;
    const binaryBatch = new Uint8Array(binaryLength);
    for (let i = 0; i < binaryLength; i++) {
        binaryBatch[i] = binaryString.charCodeAt(i);
    }
    return binaryBatch;
}


function beginInvokeJSFromDotNet(asyncHandle: number, identifier: string, argsJson: string | null, resultType: DotNet.JSCallResultType, targetInstanceId: number): void {
    // Coerce synchronous functions into async ones, plus treat
    // synchronous exceptions the same as async ones
    const promise = new Promise<any>(resolve => {
        const args = argsJson ? parseJsonWithRevivers(argsJson) : null;
        const jsFunction = DotNet.findJSFunction(identifier, targetInstanceId);
        const synchronousResultOrPromise = jsFunction(...(args || []));
        resolve(synchronousResultOrPromise);
    });

    // We only listen for a result if the caller wants to be notified about it
    if (asyncHandle) {
        // On completion, dispatch result back to .NET
        // Not using "await" because it codegens a lot of boilerplate
        promise.
        then(
            result => endInvokeJSFromDotNet(identifier, asyncHandle, true, JSON.stringify(createJSCallResult(result, resultType))),
            error => {
                console.error(error);
                
                return endInvokeJSFromDotNet(identifier, asyncHandle, false, JSON.stringify([asyncHandle, false, (error)]));
            }
        );
    }
}

function createJSCallResult(returnValue: any, resultType: JSCallResultType) {
    switch (resultType) {
        case JSCallResultType.Default:
            return returnValue;
        case JSCallResultType.JSObjectReference:
            return createJSObjectReference(returnValue);
        case JSCallResultType.JSStreamReference:
            return createJSStreamReference(returnValue);
        case JSCallResultType.JSVoidResult:
            return null;
        default:
            throw new Error(`Invalid JS call result type '${resultType}'.`);
    }
}

function stringifyArgs(args: any[] | null) {
    return JSON.stringify(args, argReplacer);
}

function argReplacer(key: string, value: any) {
    if (value instanceof DotNetObject) {
        return value.serializeAsArg();
    } else if (value instanceof Uint8Array) {
        throw new Error('Uint8Array not supported');
    }

    return value;
}

function formatError(error: Error | string): string {
    if (error instanceof Error) {
        return `${error.message}\n${error.stack}`;
    }

    return error ? error.toString() : "null";
}
function attachReviver(reviver: JsonReviver) {
    jsonRevivers.push(reviver);
}

function getElementByCaptureId(referenceCaptureId: string) {
    const selector = `[${getCaptureIdAttributeName(referenceCaptureId)}]`;
    return document.querySelector(selector);
}

function getCaptureIdAttributeName(referenceCaptureId: string) {
    return `_bl_${referenceCaptureId}`;
}

const elementRefKey = '__internalId'; // Keep in sync with ElementRef.cs
const jsObjectIdKey = "__jsObjectId";
const dotNetObjectRefKey = "__dotNetObject";
const byteArrayRefKey = "__byte[]";
const dotNetStreamRefKey = "__dotNetStream";
const jsStreamReferenceLengthKey = "__jsStreamReferenceLength";

// attach element reference reviver
attachReviver((key, value) => {
    if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, elementRefKey) && typeof value[elementRefKey] === 'string') {
        return getElementByCaptureId(value[elementRefKey]);
    } else {
        return value;
    }
});
function parseJsonWithRevivers(json: string | null): any {
    const result = json ? JSON.parse(json, (key, initialValue) => {
        // Invoke each reviver in order, passing the output from the previous reviver,
        // so that each one gets a chance to transform the value

        return jsonRevivers.reduce(
            (latestValue, reviver) => reviver(key, latestValue),
            initialValue
        );
    }) : null;
    return result;
}

interface InvokeJsInfo {
    taskId: number;
    identifier: string;
    argsJson: string | null;
    resultType: JSCallResultType;
    targetInstanceId: number;
}

interface LightModeResponse {
    serializedRenderBatches: string[];
    invokeJsInfos: InvokeJsInfo[];
    renderCompleted: boolean;
}

Blazor._internal.PageTitle.getAndRemoveExistingTitle = function () : string {
    const titleElement = document.querySelector('title');
    const title = titleElement ? titleElement.textContent : '';
    return title || '';
}