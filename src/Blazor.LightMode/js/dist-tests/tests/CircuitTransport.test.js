"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test = require('node:test');
const assert = require('node:assert/strict');
const CircuitTransport_1 = require("../src/CircuitTransport");
test('settles normal location-changed response chain', async () => {
    const fetchEndpoints = [];
    const appliedBatches = [];
    const transport = (0, CircuitTransport_1.createCircuitTransport)({
        fetch: async (uri) => {
            fetchEndpoints.push(uri);
            if (uri === '_locationChanged') {
                return createJsonResponse(createResponse(['initial-batch'], false, false));
            }
            if (uri === '_waitForRender') {
                return createJsonResponse(createResponse(['final-batch'], true, false));
            }
            throw new Error(`Unexpected endpoint ${uri}`);
        },
        getRequestId: () => 'req-1',
        getAcknowledgedResponseId: () => 0,
        reload: () => {
            throw new Error('Reload should not be called');
        },
        applyResponse: response => {
            appliedBatches.push(...response.serializedRenderBatches);
        }
    });
    await settleWithin(transport.invoke('_locationChanged', { RequestId: 'req-1', Location: '/counter' }));
    assert.deepEqual(fetchEndpoints, ['_locationChanged', '_waitForRender']);
    assert.deepEqual(appliedBatches, ['initial-batch', 'final-batch']);
});
test('settles normal after-render response chain', async () => {
    const fetchEndpoints = [];
    const appliedBatches = [];
    const transport = (0, CircuitTransport_1.createCircuitTransport)({
        fetch: async (uri) => {
            fetchEndpoints.push(uri);
            if (uri === '_invokeMethodAsync') {
                return createJsonResponse(createResponse(['invoke-batch'], true, true));
            }
            if (uri === '_onAfterRender') {
                return createJsonResponse(createResponse(['after-render-batch'], true, false));
            }
            throw new Error(`Unexpected endpoint ${uri}`);
        },
        getRequestId: () => 'req-after-render',
        getAcknowledgedResponseId: () => 0,
        reload: () => {
            throw new Error('Reload should not be called');
        },
        applyResponse: response => {
            appliedBatches.push(...response.serializedRenderBatches);
        }
    });
    await settleWithin(transport.invoke('_invokeMethodAsync', { RequestId: 'req-after-render' }));
    assert.deepEqual(fetchEndpoints, ['_invokeMethodAsync', '_onAfterRender']);
    assert.deepEqual(appliedBatches, ['invoke-batch', 'after-render-batch']);
});
test('sends the latest acknowledged response id on follow-up requests', async () => {
    const requestBodies = [];
    let acknowledgedResponseId = 0;
    const transport = (0, CircuitTransport_1.createCircuitTransport)({
        fetch: async (uri, init) => {
            requestBodies.push(JSON.parse(String(init.body ?? '{}')));
            if (uri === '_locationChanged') {
                return createJsonResponse(createResponse(['initial-batch'], false, false, 7));
            }
            if (uri === '_waitForRender') {
                return createJsonResponse(createResponse(['final-batch'], true, false));
            }
            throw new Error(`Unexpected endpoint ${uri}`);
        },
        getRequestId: () => 'req-ack',
        getAcknowledgedResponseId: () => acknowledgedResponseId,
        reload: () => {
            throw new Error('Reload should not be called');
        },
        applyResponse: response => {
            acknowledgedResponseId = response.responseId ?? acknowledgedResponseId;
        }
    });
    await settleWithin(transport.invoke('_locationChanged', { RequestId: 'req-ack', Location: '/counter' }));
    assert.equal(requestBodies[0].AcknowledgedResponseId, 0);
    assert.equal(requestBodies[1].AcknowledgedResponseId, 7);
});
test('rejects transport failures without hanging', async () => {
    const transport = (0, CircuitTransport_1.createCircuitTransport)({
        fetch: async () => {
            throw new Error('network down');
        },
        getRequestId: () => 'req-2',
        getAcknowledgedResponseId: () => 0,
        reload: () => {
            throw new Error('Reload should not be called');
        },
        applyResponse: () => {
        }
    });
    await assert.rejects(settleWithin(transport.invoke('_locationChanged', { RequestId: 'req-2', Location: '/broken' })), /network down/);
});
test('settles and reloads on 404 responses', async () => {
    let reloadCount = 0;
    let applyCount = 0;
    const transport = (0, CircuitTransport_1.createCircuitTransport)({
        fetch: async () => ({
            status: 404,
            ok: false,
            json: async () => createResponse([], true, false),
            text: async () => 'not found'
        }),
        getRequestId: () => 'req-3',
        getAcknowledgedResponseId: () => 0,
        reload: () => {
            reloadCount++;
        },
        applyResponse: () => {
            applyCount++;
        }
    });
    await settleWithin(transport.invoke('_locationChanged', { RequestId: 'req-3', Location: '/missing' }));
    assert.equal(reloadCount, 1);
    assert.equal(applyCount, 0);
});
test('location-changing callback settles and calls endLocationChanging', async () => {
    const calls = [];
    const locationChanging = (0, CircuitTransport_1.createLocationChangingHandler)((callId, shouldContinue) => {
        calls.push([callId, shouldContinue]);
    });
    await settleWithin(locationChanging(42, '/next', undefined, true));
    assert.deepEqual(calls, [[42, true]]);
});
test('navigation stress keeps render-batch processing active', async () => {
    const appliedBatches = [];
    let waitBatchCounter = 0;
    const transport = (0, CircuitTransport_1.createCircuitTransport)({
        fetch: async (uri, init) => {
            const body = JSON.parse(String(init.body ?? '{}'));
            if (uri === '_locationChanged') {
                return createJsonResponse(createResponse([`location:${body.Location}`], false, false));
            }
            if (uri === '_waitForRender') {
                waitBatchCounter++;
                return createJsonResponse(createResponse([`wait:${waitBatchCounter}`], true, false));
            }
            throw new Error(`Unexpected endpoint ${uri}`);
        },
        getRequestId: () => 'req-stress',
        getAcknowledgedResponseId: () => 0,
        reload: () => {
            throw new Error('Reload should not be called');
        },
        applyResponse: response => {
            appliedBatches.push(...response.serializedRenderBatches);
        }
    });
    const pendingCalls = Array.from({ length: 25 }, (_, index) => transport.invoke('_locationChanged', {
        RequestId: 'req-stress',
        Location: `/route-${index}`
    }));
    const results = await settleWithin(Promise.allSettled(pendingCalls), 3000);
    assert.equal(results.every(result => result.status === 'fulfilled'), true);
    assert.equal(appliedBatches.filter(batch => batch.startsWith('location:/route-')).length, 25);
    assert.equal(appliedBatches.filter(batch => batch.startsWith('wait:')).length, 25);
    assert.equal(appliedBatches.includes('location:/route-24'), true);
});
function createResponse(serializedRenderBatches, renderCompleted, needsAfterRender, responseId = null) {
    return {
        serializedRenderBatches,
        invokeJsInfos: [],
        renderCompleted,
        needsAfterRender,
        responseId
    };
}
function createJsonResponse(payload, status = 200) {
    return {
        status,
        ok: status >= 200 && status < 300,
        json: async () => payload,
        text: async () => JSON.stringify(payload)
    };
}
async function settleWithin(promise, timeoutMs = 1000) {
    return await Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs))
    ]);
}
