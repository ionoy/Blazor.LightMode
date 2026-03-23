"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCircuitTransport = createCircuitTransport;
exports.createLocationChangingHandler = createLocationChangingHandler;
const jsonHeaders = {
    'Content-Type': 'application/json'
};
function createCircuitTransport(dependencies) {
    const post = async (endpoint, body) => {
        let response;
        try {
            response = await dependencies.fetch(endpoint, {
                method: 'POST',
                headers: jsonHeaders,
                body: JSON.stringify(appendAcknowledgedResponseId(body, dependencies.getAcknowledgedResponseId()))
            });
        }
        catch (error) {
            throw new Error(`LightMode request '${endpoint}' failed: ${formatUnknownError(error)}`);
        }
        if (response.status === 404) {
            dependencies.reload();
            return null;
        }
        if (!response.ok) {
            const details = await readResponseError(response);
            throw new Error(`LightMode request '${endpoint}' failed with status ${response.status}${details ? `: ${details}` : ''}`);
        }
        return await response.json();
    };
    const continueFrom = async (response) => {
        let currentResponse = response;
        while (true) {
            const nextEndpoint = resolveNextEndpoint(currentResponse);
            if (!nextEndpoint) {
                return;
            }
            const nextResponse = await post(nextEndpoint, { RequestId: dependencies.getRequestId() });
            if (!nextResponse) {
                return;
            }
            await dependencies.applyResponse(nextResponse);
            currentResponse = nextResponse;
        }
    };
    const invoke = async (endpoint, body) => {
        const initialResponse = await post(endpoint, body);
        if (!initialResponse) {
            return;
        }
        await dependencies.applyResponse(initialResponse);
        await continueFrom(initialResponse);
    };
    return {
        invoke,
        continueFrom
    };
}
function createLocationChangingHandler(endLocationChanging) {
    return async (callId, _uri, _state, _intercepted) => {
        endLocationChanging(callId, true);
    };
}
function resolveNextEndpoint(response) {
    if (response.needsAfterRender) {
        return '_onAfterRender';
    }
    if (!response.renderCompleted) {
        return '_waitForRender';
    }
    return null;
}
async function readResponseError(response) {
    if (!response.text) {
        return '';
    }
    try {
        return await response.text();
    }
    catch {
        return '';
    }
}
function formatUnknownError(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
function appendAcknowledgedResponseId(body, acknowledgedResponseId) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return body;
    }
    return {
        ...body,
        AcknowledgedResponseId: acknowledgedResponseId
    };
}
