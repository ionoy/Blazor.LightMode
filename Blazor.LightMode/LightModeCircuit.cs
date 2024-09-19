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
    
    private int _nextTaskId;

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
        
        _renderer = new LightModeRenderer(_serviceProvider, _loggerFactory);
    }

    public async Task RenderRootComponentAsync(HttpContext context, Type componentType)
    {
        var htmlString = await _renderer.Dispatcher.InvokeAsync(async () => {
            var taskId = NextTaskId();
            
            _renderer.RendererEvents.PushTask(taskId);
            
            var partialRenderOrJsCallTask = _renderer.RendererEvents.WaitFor(EventKind.RenderBatchReceived | EventKind.JSCall);
            var component = _renderer.RenderComponent(componentType);
            var fullRenderTask = component.QuiescenceTask.ContinueWith(_ => _renderer.RendererEvents.PopTask(taskId));
            
            var resultTask = await Task.WhenAny(fullRenderTask, partialRenderOrJsCallTask);

            _logger.LogDebug(resultTask == partialRenderOrJsCallTask 
                ? "Root: Render or JS call received while waiting for render" 
                : "Root: Parent invoke completed while executing the current operation");
            
            return component.ToHtmlString();
        });
        
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
        return await InvokeAsync(async taskId => {
            var eventDescriptor = JsonSerializer.Deserialize<EventDescriptor>(eventDescriptorJson.GetRawText(), _jsRuntime.JsonSerializerOptions)!;
            var eventArgsType = _renderer.GetEventArgsType(eventDescriptor.EventHandlerId);
            var eventArgs = (EventArgs)JsonSerializer.Deserialize(eventArgsJson.GetRawText(), eventArgsType, _jsRuntime.JsonSerializerOptions)!;
        
            _logger.LogDebug("{TaskId} Dispatching event '{EventName}' to event handler {EventHandlerId}", taskId, eventDescriptor.EventName, eventDescriptor.EventHandlerId);
            
            await _renderer.DispatchEventAsync(eventDescriptor.EventHandlerId, eventDescriptor.EventFieldInfo, eventArgs);
        }, NextTaskId());
    }
    public async Task<LightModeResponse> EndInvokeJSFromDotNet(int? asyncHandle, bool success, string result)
    {
        return await InvokeAsync(taskId => {
            _logger.LogDebug("{TaskId} EndInvokeJSFromDotNet: {AsyncHandle}, {Success}, {Result}", taskId, asyncHandle, success, result);
            _jsRuntime.EndInvokeJSFromDotNet(asyncHandle, success, result);
        }, NextTaskId());
    }
    private int NextTaskId() => Interlocked.Increment(ref _nextTaskId);

    public async Task<LightModeResponse> LocationChanged(string location)
    {
        return await InvokeAsync(async taskId => {
            _logger.LogDebug("{TaskId} Location changed to {Location}", taskId, location);
            _navigationManager.NotifyLocationChanged(location);
            
            await _renderer.RendererEvents.WaitFor(EventKind.JSCall | EventKind.RenderBatchReceived);
        }, NextTaskId());
    }
    
    public async Task<LightModeResponse> OnAfterRender()
    {
        return await InvokeAsync(async taskId => {
            _logger.LogDebug("{TaskId} OnAfterRender", taskId);
            await _renderer.InvokeOnAfterRender();
        }, NextTaskId());
    }
    
    public async Task<LightModeResponse> WaitForRender()
    {
        var taskId = NextTaskId();
        _logger.LogDebug("{TaskId} Waiting for render", taskId);
        await _renderer.RendererEvents.WaitFor(EventKind.JSCall | EventKind.RenderBatchReceived).ConfigureAwait(false);
        
        return await InvokeAsync(_ => {}, taskId);
    }
    
    private async Task<LightModeResponse> InvokeAsync(Func<int, Task> action, int taskId)
    {
        return await _renderer.Dispatcher.InvokeAsync(async () => {
            _renderer.MakeSurePendingTasksNotNull();
            
            var wrappedAction = InvokeWrapper(action, taskId);
            var renderOrJsCallReceived = _renderer.RendererEvents.WaitFor(EventKind.RenderBatchReceived | EventKind.JSCall);
            
            var resultTask = await Task.WhenAny(wrappedAction(), renderOrJsCallReceived);

            _logger.LogDebug(resultTask == renderOrJsCallReceived 
                ? "{TaskId} Render or JS call received while waiting for render" 
                : "{TaskId} Parent invoke completed while executing the current operation", taskId);

            return _renderer.CreateLightModeResponse();
        }).ConfigureAwait(false);
    }
    
    private Func<Task> InvokeWrapper(Func<int, Task> action, int taskId) => async () => {

        try
        {
            _renderer.RendererEvents.PushTask(taskId);
            await action(taskId);
        }
        catch (Exception e)
        {
            _logger.LogError(e, "An unhandled exception occurred while executing the current operation");
        }
        finally
        {
            _renderer.RendererEvents.PopTask(taskId);
        }
    };

    private async Task<LightModeResponse> InvokeAsync(Action<int> action, int taskId)
    {
        return await _renderer.Dispatcher.InvokeAsync(() => {
            _renderer.MakeSurePendingTasksNotNull();
            InvokeWrapper(action, taskId);
            return _renderer.CreateLightModeResponse();
        }).ConfigureAwait(false);
    }
    
    private void InvokeWrapper(Action<int> action, int taskId)
    {
        try
        {
            _renderer.RendererEvents.PushTask(taskId);
            action(taskId);
        }
        catch (Exception e)
        {
            _logger.LogError(e, "An unhandled exception occurred while executing the current operation");
        }
        finally
        {
            _renderer.RendererEvents.PopTask(taskId);
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