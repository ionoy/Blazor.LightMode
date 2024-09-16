// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

import { renderBatch, attachRootComponentToLogicalElement } from './Rendering/Renderer';
import {WebRendererId} from "./Rendering/WebRendererId";
import {OutOfProcessRenderBatch} from "./Rendering/RenderBatch/OutOfProcessRenderBatch";
import {toLogicalElement} from "./Rendering/LogicalElements";
import {attachWebRendererInterop} from "./Rendering/WebRendererInteropMethods";
import {DotNet} from "@microsoft/dotnet-js-interop";
import DotNetObject = DotNet.DotNetObject;
import {Blazor} from "./GlobalExports";

let requestId = "";

const commentNodes = document.getRootNode().childNodes;
for (let i = commentNodes.length - 1; i >= 0; i--) {
    const commentNode = commentNodes[i];
    if (commentNode.nodeType === Node.COMMENT_NODE) {
        requestId = commentNode.nodeValue!.substring(10);
        console.log("requestId", requestId);
        break;
    }
}

function boot() {
    const initScript = document.getElementById('blazor-initialization');

    if (initScript) {
        // @ts-ignore
        const serializedRenderBatch = initScript.textContent.trim();
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

        renderSerializedRenderBatch(serializedRenderBatch);

        let htmlNew = (fragment as unknown as Element).children[0];
        documentRoot.appendChild(htmlNew);

        const interopMethods = {
            serializeAsArg() {
                return { ["__dotNetObject"]: 0 };
            },
            dispose(): void {
            },
            invokeMethod: invokeMethodLightMode,
            invokeMethodAsync: invokeMethodAsyncLightMode,
            // ... include other necessary methods
        } as unknown as DotNetObject;

        attachWebRendererInterop(WebRendererId.Server, interopMethods, undefined, undefined);

        onAfterRender();
    }
}

window['DotNet'] = DotNet;
document.addEventListener("DOMContentLoaded", function(event) {
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
    return new Promise<T>((resolve, reject) => {
        fetch(`_invokeMethodAsync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                RequestId: requestId,
                AssemblyName: null,
                MethodIdentifier: methodIdentifier,
                ObjectReference: 0,
                Arguments: args
            })
        }).then(async response => {
            const responseBody = await response.json() as LightModeResponse;
            console.log("invokeMethodAsyncLightMode response", responseBody);
            await renderBatches(responseBody.serializedRenderBatches);
        }).catch(error => {
            console.error("invokeMethodAsyncLightMode error", error);
            reject(error);
        });
    });
}

function locationChanged(uri: string, intercepted: boolean): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        fetch(`_locationChanged`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                RequestId: requestId,
                Location: uri,
            })
        }).then(async response => {
            const responseBody = await response.json() as LightModeResponse;
            console.log("locationChanged response", responseBody);
            await renderBatches(responseBody.serializedRenderBatches);
        }).catch(error => {
            console.error("locationChanged error", error);
            reject(error);
        });
    });
}

function onAfterRender(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        fetch(`_onAfterRender`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                RequestId: requestId
            })
        }).then(async response => {
            const responseBody = await response.json() as LightModeResponse;
            console.log("onAfterRender response", responseBody);
            await renderBatches(responseBody.serializedRenderBatches);
        }).catch(error => {
            console.error("onAfterRender error", error);
            reject(error);
        });
    });
}

async function renderBatches(serializedRenderBatches: string[]) {
    for (const batch of serializedRenderBatches)
        renderSerializedRenderBatch(batch);

    if (serializedRenderBatches.length > 0)
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

interface LightModeResponse {
    serializedRenderBatches: string[];
}
    