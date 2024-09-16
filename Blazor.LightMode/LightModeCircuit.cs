using System.Diagnostics.CodeAnalysis;
using System.Reflection;
using System.Text.Json;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.RenderTree;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Blazor.LightMode;

[SuppressMessage("Usage", "BL0006:Do not use RenderTree types")]
public class LightModeCircuit : IDisposable
{
    private readonly LightModeRenderer _renderer;
    private readonly IServiceScope _serviceScope;
    private readonly string _requestId;
    private readonly ILoggerFactory _loggerFactory;
    
    public IServiceProvider Services => _serviceScope.ServiceProvider;
    
    public LightModeCircuit(HttpContext context, string requestId, ILoggerFactory loggerFactory)
    {
        _requestId = requestId;
        _loggerFactory = loggerFactory;
        _serviceScope = context.RequestServices.CreateScope();
        _renderer = new LightModeRenderer(_serviceScope.ServiceProvider, _loggerFactory, this);
    }

    public async Task RenderRootComponentAsync<TComponent>(HttpContext context) where TComponent : IComponent
    {
        var component = await _renderer.RenderComponentAsync<TComponent>().ConfigureAwait(false);
        var htmlString = await _renderer.Dispatcher.InvokeAsync(() => component.ToHtmlString()).ConfigureAwait(false);
        
        await context.Response.WriteAsync($"<!--requestId:{_requestId}-->").ConfigureAwait(false);
        await context.Response.WriteAsync(htmlString).ConfigureAwait(false);
    }
    
    public async Task<LightModeResponse> InvokeMethodAsync(string? assemblyName, string? methodIdentifier, int? objectReference, JsonElement[] args)
    {
        if (objectReference == 0) 
        {
            await _renderer.InvokeMethodAsync(assemblyName, methodIdentifier, args).ConfigureAwait(false);
            var renderBatches = _renderer.GetSerializedRenderBatches();
            
            return new LightModeResponse(renderBatches);
        }
        
        return new LightModeResponse(Array.Empty<string>());
    }
    public void Dispose()
    {
        _renderer.Dispose();
        _serviceScope.Dispose();
        _loggerFactory.Dispose();
    }
    
    public async Task<LightModeResponse> LocationChangedAsync(string location)
    {
        await _renderer.LocationChanged(location);
        var renderBatches = _renderer.GetSerializedRenderBatches();
        
        return new LightModeResponse(renderBatches);
    }
}

public record LightModeResponse(IReadOnlyList<string> SerializedRenderBatches);