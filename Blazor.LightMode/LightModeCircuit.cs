using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.JSInterop;

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
        _renderer = new LightModeRenderer(this, _serviceScope.ServiceProvider, _loggerFactory);
    }

    public async Task RenderRootComponentAsync(HttpContext context, Type componentType)
    {
        _renderer.IsInitialRender = true;
        var component = await _renderer.RenderComponentAsync(componentType).ConfigureAwait(false);
        var htmlString = await _renderer.Dispatcher.InvokeAsync(() => component.ToHtmlString()).ConfigureAwait(false);
        _renderer.IsInitialRender = false;
        
        await context.Response.WriteAsync($"<!--requestId:{_requestId}-->").ConfigureAwait(false);
        await context.Response.WriteAsync(htmlString).ConfigureAwait(false);
    }
    
    public async Task<LightModeResponse> InvokeMethodAsync(string? assemblyName, string? methodIdentifier, int? objectReference, JsonElement[] args) => await _renderer.InvokeMethodAsync(assemblyName, methodIdentifier, objectReference, args).ConfigureAwait(false);
    public async Task<LightModeResponse> LocationChangedAsync(string location) => await _renderer.LocationChanged(location).ConfigureAwait(false);
    public async Task<LightModeResponse> OnAfterRenderAsync() => await _renderer.OnAfterRender().ConfigureAwait(false);
    public async Task<LightModeResponse> EndInvokeJSFromDotNet(int? asyncHandle, bool success, string result) => await _renderer.EndInvokeJSFromDotNet(asyncHandle, success, result).ConfigureAwait(false);

    public void Dispose()
    {
        _renderer.Dispose();
        _serviceScope.Dispose();
        _loggerFactory.Dispose();
    }
}