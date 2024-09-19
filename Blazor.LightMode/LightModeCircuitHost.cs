using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Extensions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Blazor.LightMode;

public class LightModeCircuitHost
{
    private readonly ILightModeCircuitManager _circuitManager;
    private readonly ConcurrentDictionary<string, LightModeCircuit> _circuits = new();
    private readonly ILoggerFactory _loggerFactory;
    
    public LightModeCircuitHost(ILoggerFactory loggerFactory, ILightModeCircuitManager circuitManager)
    {
        _loggerFactory = loggerFactory;
        _circuitManager = circuitManager;
        
        _circuitManager.SetCircuitHost(this);
    }

    private LightModeCircuit CreateCircuit(HttpContext context)
    {
        var circuitId = Guid.NewGuid().ToString();
        var circuit = new LightModeCircuit(context, circuitId, _loggerFactory);
        _circuits.TryAdd(circuitId, circuit);
        
        _circuitManager.OnNewCircuit(circuitId);
        
        return circuit;
    }
    
    public async Task StartRequest(HttpContext context, Type componentType)
    {
        var circuit = CreateCircuit(context);
        var navigationManager = (LightModeNavigationManager)circuit.Services.GetRequiredService<NavigationManager>();
        var baseUri = GetBaseUri(context.Request);
        var fullUri = GetFullUri(context.Request);
        
        navigationManager.Initialize(baseUri, fullUri);
        
        await circuit.RenderRootComponentAsync(context, componentType);
    }
    private static string GetBaseUri(HttpRequest request)
    {
        var result = UriHelper.BuildAbsolute(request.Scheme, request.Host, request.PathBase);

        // PathBase may be "/" or "/some/thing", but to be a well-formed base URI
        // it has to end with a trailing slash
        return result.EndsWith('/') ? result : result += "/";
    }

    private static string GetFullUri(HttpRequest request)
    {
        return UriHelper.BuildAbsolute(
            request.Scheme,
            request.Host,
            request.PathBase,
            request.Path,
            request.QueryString);
    }
    
    public async Task<LightModeResponse?> InvokeMethod(string circuitId, string? assemblyName, string methodIdentifier, int objectReference, JsonElement[] arguments)
    {
        if (_circuits.TryGetValue(circuitId, out var circuit))
        {
            _circuitManager.OnTask(circuitId);
            return await circuit.InvokeMethodAsync(assemblyName, methodIdentifier, objectReference, arguments);
        }
        
        return null;
    }

    public async Task<LightModeResponse?> LocationChanged(string circuitId, string location)
    {
        if (_circuits.TryGetValue(circuitId, out var circuit))
        {
            _circuitManager.OnTask(circuitId);
            return await circuit.LocationChanged(location);
        }
        
        return null;
    }
    public async Task<LightModeResponse?> OnAfterRender(string circuitId)
    {
        if (_circuits.TryGetValue(circuitId, out var circuit))
        {
            _circuitManager.OnTask(circuitId);
            return await circuit.OnAfterRender();
        }
        
        return null;
    }
    public async Task<LightModeResponse?> EndInvokeJSFromDotNet(string circuitId, int? asyncHandle, bool success, string result)
    {
        if (_circuits.TryGetValue(circuitId, out var circuit))
        {
            _circuitManager.OnTask(circuitId);
            return await circuit.EndInvokeJSFromDotNet(asyncHandle, success, result);
        }
        
        return null;
    }
    public async Task<LightModeResponse?> WaitForRender(string circuitId)
    {
        if (_circuits.TryGetValue(circuitId, out var circuit))
        {
            _circuitManager.OnTask(circuitId);
            return await circuit.WaitForRender();
        }
        
        return null;
    }
    public void StopCircuit(string circuitId)
    {
        if (_circuits.TryRemove(circuitId, out var circuit))
            circuit.Dispose();
    }
}