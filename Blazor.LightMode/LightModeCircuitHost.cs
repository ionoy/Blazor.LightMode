using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Extensions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Blazor.LightMode;

public class LightModeCircuitHost(ILoggerFactory loggerFactory)
{
    private readonly ConcurrentDictionary<string, LightModeCircuit> _circuits = new();

    private LightModeCircuit CreateCircuit(HttpContext context)
    {
        var requestId = Guid.NewGuid().ToString();
        var circuit = new LightModeCircuit(context, requestId, loggerFactory);
        _circuits.TryAdd(requestId, circuit);
        return circuit;
    }
    
    public async Task StartRequest<TRootComponent>(HttpContext context) where TRootComponent : IComponent => await StartRequest(context, typeof(TRootComponent));

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
    
    public async Task<LightModeResponse?> InvokeMethodAsync(string requestId, string? assemblyName, string methodIdentifier, int objectReference, JsonElement[] arguments)
    {
        if (_circuits.TryGetValue(requestId, out var circuit))
            return await circuit.InvokeMethodAsync(assemblyName, methodIdentifier, objectReference, arguments);
        
        return null;
    }

    public async Task<LightModeResponse?> LocationChangedAsync(string requestId, string location)
    {
        if (_circuits.TryGetValue(requestId, out var circuit))
            return await circuit.LocationChangedAsync(location);
        
        return null;
    }
    public async Task<LightModeResponse?> OnAfterRenderAsync(string requestId)
    {
        if (_circuits.TryGetValue(requestId, out var circuit))
            return await circuit.OnAfterRenderAsync();
        
        return null;
    }
    public async Task<LightModeResponse?> EndInvokeJSFromDotNet(string requestId, int? asyncHandle, bool success, string result)
    {
        if (_circuits.TryGetValue(requestId, out var circuit))
            return await circuit.EndInvokeJSFromDotNet(asyncHandle, success, result);
        
        return null;
    }
}