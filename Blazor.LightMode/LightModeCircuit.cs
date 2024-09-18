using System.ComponentModel;
using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.RenderTree;
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
    private readonly ILogger<LightModeCircuit> _logger;
    private readonly IServiceProvider _serviceProvider;
    private readonly LightModeJSRuntime _jsRuntime;
    private readonly LightModeNavigationManager _navigationManager;

    public IServiceProvider Services => _serviceScope.ServiceProvider;
    
    public LightModeCircuit(HttpContext context, string requestId, ILoggerFactory loggerFactory)
    {
        _requestId = requestId;
        _loggerFactory = loggerFactory;
        _serviceScope = context.RequestServices.CreateScope();
        _serviceProvider = _serviceScope.ServiceProvider;
        
        _logger = _serviceProvider.GetRequiredService<ILogger<LightModeCircuit>>();
        _jsRuntime = _serviceProvider.GetRequiredService<JSRuntime>() as LightModeJSRuntime ?? throw new InvalidOperationException("The JSRuntime must be an instance of LightModeJSRuntime");
        _navigationManager = _serviceProvider.GetRequiredService<NavigationManager>() as LightModeNavigationManager ?? throw new InvalidOperationException("The NavigationManager must be an instance of LightModeNavigationManager");
        
        _renderer = new LightModeRenderer(this, _serviceProvider, _loggerFactory);
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
    
public async Task<LightModeResponse> InvokeMethodAsync(string? assemblyName, string? methodIdentifier, int? objectReference, JsonElement[] args)
    {
        if (objectReference == 0 && methodIdentifier == nameof(DispatchEventAsync))
        {
            if (args.Length != 2)
                throw new ArgumentException("The number of arguments must be 2");
            
            return await DispatchEventAsync(args[0], args[1]);
        }

        return _renderer.CreateLightModeResponse();
    }
    
    private async Task<LightModeResponse> DispatchEventAsync(JsonElement eventDescriptorJson, JsonElement eventArgsJson)
    {
        return await InvokeAsync(async () => {
            var eventDescriptor = JsonSerializer.Deserialize<EventDescriptor>(eventDescriptorJson.GetRawText(), _jsRuntime.JsonSerializerOptions)!;
            var eventArgsType = _renderer.GetEventArgsType(eventDescriptor.EventHandlerId);
            var eventArgs = (EventArgs)JsonSerializer.Deserialize(eventArgsJson.GetRawText(), eventArgsType, _jsRuntime.JsonSerializerOptions)!;
        
            _logger.LogTrace("Dispatching event '{EventName}' to event handler {EventHandlerId}", eventDescriptor.EventName, eventDescriptor.EventHandlerId);
            await _renderer.DispatchEventAsync(eventDescriptor.EventHandlerId, eventDescriptor.EventFieldInfo, eventArgs);
        });
    }
    public async Task<LightModeResponse> EndInvokeJSFromDotNet(int? asyncHandle, bool success, string result)
    {
        return await InvokeAsync(() => {
            _logger.LogTrace("EndInvokeJSFromDotNet: {AsyncHandle}, {Success}, {Result}", asyncHandle, success, result);
            _jsRuntime.EndInvokeJSFromDotNet(asyncHandle, success, result);
        });
    }
    
    public async Task<LightModeResponse> LocationChanged(string location)
    {
        return await InvokeAsync(() => {
            _logger.LogTrace("Location changed to {Location}", location);
            _navigationManager.NotifyLocationChanged(location);
        });
    }
    
    public async Task<LightModeResponse> OnAfterRender()
    {
        return await InvokeAsync(async () => {
            _logger.LogTrace("OnAfterRender");
            await _renderer.CallOnAfterRender();
        });
    }
    
    public async Task<LightModeResponse> WaitForRender()
    {
        _logger.LogTrace("Waiting for render");
        await _renderer.RendererEvents.WaitFor(EventKind.JSCall | EventKind.RenderBatchReceived | EventKind.PopInvocation);
        
        return await InvokeAsync(() => {});
    }
    
    private async Task<LightModeResponse> InvokeAsync(Func<Task> action)
    {
        return await _renderer.Dispatcher.InvokeAsync(async () => {
            _renderer.MakeSurePendingTasksNotNull();
            
            var wrappedAction = InvokeWrapper(action);
            var renderOrJsCallReceived = _renderer.RendererEvents.WaitFor(EventKind.RenderBatchReceived | EventKind.JSCall);
            
            await Task.WhenAny(wrappedAction(), renderOrJsCallReceived);
            
            return _renderer.CreateLightModeResponse();
        }).ConfigureAwait(false);
    }
    
    private Func<Task> InvokeWrapper(Func<Task> action) => async () => {

        try
        {
            _renderer.RendererEvents.PushInvocation();
            await action();
        }
        catch (Exception e)
        {
            _logger.LogError(e, "An unhandled exception occurred while executing the current operation");
        }
        finally
        {
            _renderer.RendererEvents.PopInvocation();
        }
    };

    private async Task<LightModeResponse> InvokeAsync(Action action)
    {
        return await _renderer.Dispatcher.InvokeAsync(() => {
            _renderer.MakeSurePendingTasksNotNull();
            InvokeWrapper(action);
            return _renderer.CreateLightModeResponse();
        }).ConfigureAwait(false);
    }
    
    private void InvokeWrapper(Action action)
    {
        try
        {
            _renderer.RendererEvents.PushInvocation();
            action();
        }
        catch (Exception e)
        {
            _logger.LogError(e, "An unhandled exception occurred while executing the current operation");
        }
        finally
        {
            _renderer.RendererEvents.PopInvocation();
        }
    }

    public void Dispose()
    {
        _renderer.Dispose();
        _serviceScope.Dispose();
        _loggerFactory.Dispose();
    }

    record EventDescriptor(ulong EventHandlerId, string EventName, EventFieldInfo? EventFieldInfo);
}