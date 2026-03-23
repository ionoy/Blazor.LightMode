export interface InvokeJsInfo {
    taskId: number;
    identifier: string;
    argsJson: string | null;
    resultType: number;
    targetInstanceId: number;
}

export interface LightModeResponse {
    serializedRenderBatches: string[];
    invokeJsInfos: InvokeJsInfo[];
    renderCompleted: boolean;
    needsAfterRender: boolean;
    responseId: number | null;
}

export interface LightModeFetchResponse {
    status: number;
    ok: boolean;
    json(): Promise<unknown>;
    text?(): Promise<string>;
}

export interface CircuitTransportDependencies {
    fetch: (uri: string, init: RequestInit) => Promise<LightModeFetchResponse>;
    getRequestId: () => string;
    getAcknowledgedResponseId: () => number;
    reload: () => void;
    applyResponse: (response: LightModeResponse) => Promise<void> | void;
}

export interface CircuitTransport {
    invoke: (endpoint: string, body: unknown) => Promise<void>;
    continueFrom: (response: LightModeResponse) => Promise<void>;
}

const jsonHeaders = {
    'Content-Type': 'application/json'
};

export function createCircuitTransport(dependencies: CircuitTransportDependencies): CircuitTransport {
    const post = async (endpoint: string, body: unknown): Promise<LightModeResponse | null> => {
        let response: LightModeFetchResponse;

        try {
            response = await dependencies.fetch(endpoint, {
                method: 'POST',
                headers: jsonHeaders,
                body: JSON.stringify(appendAcknowledgedResponseId(body, dependencies.getAcknowledgedResponseId()))
            });
        } catch (error) {
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

        return await response.json() as LightModeResponse;
    };

    const continueFrom = async (response: LightModeResponse): Promise<void> => {
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

    const invoke = async (endpoint: string, body: unknown): Promise<void> => {
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

export function createLocationChangingHandler(endLocationChanging: (callId: number, shouldContinue: boolean) => void) {
    return async (callId: number, _uri: string, _state: string | undefined, _intercepted: boolean): Promise<void> => {
        endLocationChanging(callId, true);
    };
}

function resolveNextEndpoint(response: LightModeResponse): string | null {
    if (response.needsAfterRender) {
        return '_onAfterRender';
    }

    if (!response.renderCompleted) {
        return '_waitForRender';
    }

    return null;
}

async function readResponseError(response: LightModeFetchResponse): Promise<string> {
    if (!response.text) {
        return '';
    }

    try {
        return await response.text();
    } catch {
        return '';
    }
}

function formatUnknownError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

function appendAcknowledgedResponseId(body: unknown, acknowledgedResponseId: number): unknown {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return body;
    }

    return {
        ...(body as Record<string, unknown>),
        AcknowledgedResponseId: acknowledgedResponseId
    };
}
