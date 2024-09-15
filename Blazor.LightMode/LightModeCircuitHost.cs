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
    
    public async Task StartRequest<TRootComponent>(HttpContext context) where TRootComponent : IComponent
    {
        var circuit = CreateCircuit(context);
        var navigationManager = (LightModeNavigationManager)circuit.Services.GetRequiredService<NavigationManager>();
        var baseUri = context.Request.Host.ToUriComponent();
        var fullUri = context.Request.GetDisplayUrl().Replace("https://", "").TrimEnd('/');
        
        navigationManager.Initialize(baseUri, fullUri);
        
        await circuit.RenderRootComponentAsync<TRootComponent>(context);
    }
    
    public Task<LightModeResponse> InvokeMethodAsync(string requestId, string? assemblyName, string methodIdentifier, int objectReference, JsonElement[] arguments)
    {
        if (_circuits.TryGetValue(requestId, out var circuit))
            return circuit.InvokeMethodAsync(assemblyName, methodIdentifier, objectReference, arguments);
        
        return Task.FromResult(new LightModeResponse(Array.Empty<string>()));
    }
}