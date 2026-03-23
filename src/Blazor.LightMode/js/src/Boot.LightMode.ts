import { renderBatch, attachRootComponentToLogicalElement } from '../../../../ext/aspnetcore/src/Components/Web.JS/src/Rendering/Renderer';
import { WebRendererId } from '../../../../ext/aspnetcore/src/Components/Web.JS/src/Rendering/WebRendererId';
import { OutOfProcessRenderBatch } from '../../../../ext/aspnetcore/src/Components/Web.JS/src/Rendering/RenderBatch/OutOfProcessRenderBatch';
import { toLogicalElement } from '../../../../ext/aspnetcore/src/Components/Web.JS/src/Rendering/LogicalElements';
import { attachWebRendererInterop } from '../../../../ext/aspnetcore/src/Components/Web.JS/src/Rendering/WebRendererInteropMethods';
import { DotNet } from '@microsoft/dotnet-js-interop';
import { Blazor } from '../../../../ext/aspnetcore/src/Components/Web.JS/src/GlobalExports';
import { createCircuitTransport, createLocationChangingHandler, LightModeResponse } from './CircuitTransport';

import JSCallResultType = DotNet.JSCallResultType;
import DotNetObject = DotNet.DotNetObject;
import createJSObjectReference = DotNet.createJSObjectReference;
import createJSStreamReference = DotNet.createJSStreamReference;
import JsonReviver = DotNet.JsonReviver;

let requestId = '';
let acknowledgedResponseId = 0;
const jsonRevivers: JsonReviver[] = [];
window['DotNet'] = DotNet;

const circuitTransport = createCircuitTransport({
    fetch: (uri, init) => fetch(uri, init),
    getRequestId: () => requestId,
    getAcknowledgedResponseId: () => acknowledgedResponseId,
    reload: () => location.reload(),
    applyResponse: response => applyLightModeResponse(response)
});

function boot() {
    const initScript = document.getElementById('blazor-initialization');

    if (initScript) {
        // @ts-ignore
        const initializationJson = initScript.textContent.trim();
        initScript.remove();

        Blazor._internal.navigationManager.enableNavigationInterception(WebRendererId.Server);
        Blazor._internal.navigationManager.listenForNavigationEvents(
            WebRendererId.Server,
            (uri: string, state: string | undefined, intercepted: boolean): Promise<void> => {
                return locationChanged(uri, intercepted);
            },
            createLocationChangingHandler((callId, shouldContinue) => {
                Blazor._internal.navigationManager.endLocationChanging(callId, shouldContinue);
            })
        );

        const documentRoot = document.getRootNode();
        const html = (documentRoot as Element).children[0];
        const fragment = document.createDocumentFragment();

        fragment.appendChild(html);

        attachRootComponentToLogicalElement(WebRendererId.Server, toLogicalElement(fragment, true), 0, false);

        const response = JSON.parse(initializationJson) as LightModeResponse;

        for (const batch of response.serializedRenderBatches) {
            renderSerializedRenderBatch(batch);
        }

        const htmlNew = (fragment as unknown as Element).children[0];
        documentRoot.appendChild(htmlNew);
        acknowledgedResponseId = response.responseId ?? acknowledgedResponseId;

        const interopMethods = {
            serializeAsArg() { return { ['__dotNetObject']: 0 }; },
            dispose(): void { },
            invokeMethod: invokeMethodLightMode,
            invokeMethodAsync: invokeMethodAsyncLightMode
        } as unknown as DotNetObject;

        attachWebRendererInterop(WebRendererId.Server, interopMethods, undefined, undefined);

        for (const invokeJsInfo of response.invokeJsInfos) {
            void beginInvokeJSFromDotNet(
                invokeJsInfo.taskId,
                invokeJsInfo.identifier,
                invokeJsInfo.argsJson,
                invokeJsInfo.resultType,
                invokeJsInfo.targetInstanceId
            ).catch(error => console.error('beginInvokeJSFromDotNet error', error));
        }

        void circuitTransport.continueFrom(response).catch(error => console.error('initial continuation error', error));
    }
}

document.addEventListener('DOMContentLoaded', function () {
    if (window['__lightmode_initialized']) {
        return;
    }

    window['__lightmode_initialized'] = true;

    const commentNodes = document.getRootNode().childNodes;
    for (let i = commentNodes.length - 1; i >= 0; i--) {
        const commentNode = commentNodes[i];
        if (commentNode.nodeType === Node.COMMENT_NODE) {
            requestId = commentNode.nodeValue!.substring(10);
            console.log('requestId', requestId);
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
    console.log('invokeMethodLightMode', methodIdentifier, args);
    return null as T;
}

async function invokeMethodAsyncLightMode<T>(methodIdentifier: string, ...args: any[]): Promise<T> {
    await circuitFetch('_invokeMethodAsync', {
        RequestId: requestId,
        AssemblyName: null,
        MethodIdentifier: methodIdentifier,
        ObjectReference: 0,
        Arguments: args
    });

    return null as T;
}

function locationChanged(uri: string, _intercepted: boolean): Promise<void> {
    return circuitFetch('_locationChanged', {
        RequestId: requestId,
        Location: uri
    });
}

function endInvokeJSFromDotNet(identifier: string, asyncHandle: number, success: boolean, result: string): Promise<void> {
    return circuitFetch('_endInvokeJSFromDotNet', {
        RequestId: requestId,
        AsyncHandle: asyncHandle,
        Success: success,
        Result: result
    });
}

async function circuitFetch(uri: string, body: any): Promise<void> {
    console.log('circuitFetch', uri, body);

    try {
        await circuitTransport.invoke(uri, body);
    } catch (error) {
        console.error(uri + ' error', error);
        throw error;
    }
}

function applyLightModeResponse(response: LightModeResponse) {
    console.log('Handling response', response);

    for (const batch of response.serializedRenderBatches) {
        renderSerializedRenderBatch(batch);
    }

    acknowledgedResponseId = response.responseId ?? acknowledgedResponseId;

    for (const invokeJsInfo of response.invokeJsInfos) {
        void beginInvokeJSFromDotNet(
            invokeJsInfo.taskId,
            invokeJsInfo.identifier,
            invokeJsInfo.argsJson,
            invokeJsInfo.resultType,
            invokeJsInfo.targetInstanceId
        ).catch(error => console.error('beginInvokeJSFromDotNet error', error));
    }
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

async function beginInvokeJSFromDotNet(asyncHandle: number, identifier: string, argsJson: string | null, resultType: DotNet.JSCallResultType, targetInstanceId: number): Promise<void> {
    let success = true;
    let resultPayload = 'null';

    try {
        const args = argsJson ? parseJsonWithRevivers(argsJson) : null;
        const jsFunction = DotNet.findJSFunction(identifier, targetInstanceId);
        const synchronousResultOrPromise = jsFunction(...(args || []));
        const result = await Promise.resolve(synchronousResultOrPromise);
        resultPayload = JSON.stringify(createJSCallResult(result, resultType));
    } catch (error) {
        console.error(error);
        success = false;
        resultPayload = JSON.stringify([asyncHandle, false, formatError(error)]);
    }

    if (!asyncHandle || resultType === JSCallResultType.JSVoidResult) {
        return;
    }

    await endInvokeJSFromDotNet(identifier, asyncHandle, success, resultPayload);
}

function heartbeat() {
    navigator.sendBeacon('_heartbeat', JSON.stringify({ RequestId: requestId }));
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
    }

    if (value instanceof Uint8Array) {
        throw new Error('Uint8Array not supported');
    }

    return value;
}

function formatError(error: unknown): string {
    if (error instanceof Error) {
        return `${error.message}\n${error.stack}`;
    }

    if (typeof error === 'string') {
        return error;
    }

    return error ? error.toString() : 'null';
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

const elementRefKey = '__internalId';
const jsObjectIdKey = '__jsObjectId';
const dotNetObjectRefKey = '__dotNetObject';
const byteArrayRefKey = '__byte[]';
const dotNetStreamRefKey = '__dotNetStream';
const jsStreamReferenceLengthKey = '__jsStreamReferenceLength';

attachReviver((key, value) => {
    if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, elementRefKey) && typeof value[elementRefKey] === 'string') {
        return getElementByCaptureId(value[elementRefKey]);
    }

    return value;
});

function parseJsonWithRevivers(json: string | null): any {
    return json ? JSON.parse(json, (key, initialValue) => {
        return jsonRevivers.reduce(
            (latestValue, reviver) => reviver(key, latestValue),
            initialValue
        );
    }) : null;
}

Blazor._internal.PageTitle.getAndRemoveExistingTitle = function (): string {
    const titleElement = document.querySelector('title');
    const title = titleElement ? titleElement.textContent : '';
    return title || '';
};
