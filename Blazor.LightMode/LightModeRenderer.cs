using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Rendering;
using Microsoft.AspNetCore.Components.RenderTree;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.Web.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.JSInterop;

namespace Blazor.LightMode;

#pragma warning disable BL0006
public partial class LightModeRenderer : WebRenderer
{
    private readonly LightModeJSRuntime _jsRuntime;
    private readonly ConcurrentQueue<string> _renderBatchQueue = [];
    private readonly ConcurrentQueue<int> _onAfterRenderQueue = [];
    private readonly LightModeNavigationManager _navigationManager;
    private readonly Dictionary<int,ComponentState> _componentStateById;
    private readonly ILogger<LightModeRenderer> _logger;
    private TaskCompletionSource? _currentInvocationTcs;
    private int _tasksRunning;
    public bool IsInitialRender { get; set; } = true;

    private static readonly Task CanceledRenderTask = Task.FromCanceled(new CancellationToken(canceled: true));
    private static readonly FieldInfo PendingTasksField = typeof(Renderer).GetField("_pendingTasks", BindingFlags.NonPublic | BindingFlags.Instance)!;
    private static readonly MethodInfo WaitForQuiescenceMethod = typeof(Renderer).GetMethod("WaitForQuiescence", BindingFlags.NonPublic | BindingFlags.Instance)!;
    private static readonly FieldInfo ComponentStateByIdField = typeof(Renderer).GetField("_componentStateById", BindingFlags.NonPublic | BindingFlags.Instance)!;
    public override Dispatcher Dispatcher { get; } = Dispatcher.CreateDefault();
    
    public LightModeRenderer(LightModeCircuit circuit, IServiceProvider serviceProvider, ILoggerFactory loggerFactory) 
        : base(serviceProvider, loggerFactory, new JsonSerializerOptions(), new JSComponentInterop(new JSComponentConfigurationStore() {}))
    {
        _navigationManager = serviceProvider.GetRequiredService<NavigationManager>() as LightModeNavigationManager ?? throw new InvalidOperationException("The NavigationManager must be an instance of LightModeNavigationManager");
        _jsRuntime = serviceProvider.GetRequiredService<JSRuntime>() as LightModeJSRuntime ?? throw new InvalidOperationException("The JSRuntime must be an instance of LightModeJSRuntime");
        _htmlEncoder = serviceProvider.GetService<HtmlEncoder>() ?? HtmlEncoder.Default;
        _javaScriptEncoder = serviceProvider.GetService<JavaScriptEncoder>() ?? JavaScriptEncoder.Default;
        _componentStateById = (Dictionary<int,ComponentState>)ComponentStateByIdField.GetValue(this)!;
        _logger = serviceProvider.GetRequiredService<ILogger<LightModeRenderer>>();
        
        _jsRuntime.Renderer = this;
    }
    
    public IReadOnlyList<string> GetSerializedRenderBatches()
    {
        var batches = new List<string>();
        
        while (_renderBatchQueue.TryDequeue(out var batch))
            batches.Add(batch);
        
        _logger.LogTrace("Emptied render batch: {RenderBatchCount}", batches.Count);
        
        return batches;
    }
    
    protected override Task UpdateDisplayAsync(in RenderBatch renderBatch)
    {
        EnqueueSerializedRenderBatch(renderBatch);

        foreach (var diff in renderBatch.UpdatedComponents.Array)
            _onAfterRenderQueue.Enqueue(diff.ComponentId);
        
        TryForceRender();
        
        _logger.LogTrace("Added render batch to queue: {RenderBatchCount}", _renderBatchQueue.Count);
        
        return CanceledRenderTask;
    }
    
    private void EnqueueSerializedRenderBatch(RenderBatch renderBatch)
    {
        using var memoryStream = new MemoryStream();
        using var renderBatchWriter = new RenderBatchWriter(memoryStream, false);
        
        renderBatchWriter.Write(in renderBatch);
        var base64 = Convert.ToBase64String(memoryStream.ToArray());
        _renderBatchQueue.Enqueue(base64);
    }

    public async Task<LightModeResponse> InvokeMethodAsync(string? assemblyName, string? methodIdentifier, int? objectReference, JsonElement[] args)
    {
        if (objectReference == 0 && methodIdentifier == nameof(DispatchEventAsync))
        {
            if (args.Length != 2)
                throw new ArgumentException("The number of arguments must be 2");
            
            await DispatchEventAsync(args[0], args[1]);
        }

        return CreateLightModeResponse();
    }
    
    private async Task DispatchEventAsync(JsonElement eventDescriptorJson, JsonElement eventArgsJson)
    {
        var eventDescriptor = JsonSerializer.Deserialize<EventDescriptor>(eventDescriptorJson.GetRawText(), _jsRuntime.JsonSerializerOptions)!;
        var eventArgsType = GetEventArgsType(eventDescriptor.EventHandlerId);
        var eventArgs = (EventArgs)JsonSerializer.Deserialize(eventArgsJson.GetRawText(), eventArgsType, _jsRuntime.JsonSerializerOptions)!;
        
        _logger.LogTrace("Dispatching event '{EventName}' to event handler {EventHandlerId}", eventDescriptor.EventName, eventDescriptor.EventHandlerId);

        await InvokeAsync(async () => {
            await DispatchEventAsync(eventDescriptor.EventHandlerId, eventDescriptor.EventFieldInfo, eventArgs);

            Console.WriteLine("Event dispatched");
        });
    }
    public async Task<LightModeResponse> EndInvokeJSFromDotNet(int? asyncHandle, bool success, string result)
    {
        _logger.LogTrace("EndInvokeJSFromDotNet: {AsyncHandle}, {Success}, {Result}", asyncHandle, success, result);
        _ = InvokeAsync(() =>
            _jsRuntime.EndInvokeJSFromDotNet(asyncHandle, success, result)
        );
        await Task.Delay(500).ConfigureAwait(false);
        
        return CreateLightModeResponse();
    }
    
    public async Task<LightModeResponse> LocationChanged(string location)
    {
        _logger.LogTrace("Location changed to {Location}", location);
        await InvokeAsync(() => _navigationManager.NotifyLocationChanged(location));
        return CreateLightModeResponse();
    }
    
    public async Task<LightModeResponse> OnAfterRender()
    {
        _logger.LogTrace("OnAfterRender");
        await InvokeAsync(async () => {
            var taskList = new List<Task>();
            
            while (_onAfterRenderQueue.TryDequeue(out var componentId))
                if (_componentStateById.TryGetValue(componentId, out var componentState) && componentState.Component is IHandleAfterRender handleAfterRender)
                    taskList.Add(handleAfterRender.OnAfterRenderAsync());
            
            await Task.WhenAll(taskList);
        });
        
        return CreateLightModeResponse();
    }
    
    private async Task InvokeAsync(Func<Task> action)
    {
        await Dispatcher.InvokeAsync(async () => {
            _currentInvocationTcs = new TaskCompletionSource();
            
            MakeSurePendingTasksNotNull();
            
            await Task.WhenAny(InvokeWrapper(action)(), _currentInvocationTcs.Task);
            
            _currentInvocationTcs = null;
        }).ConfigureAwait(false);
    }
    
    private Func<Task> InvokeWrapper(Func<Task> action) => async () => {

        try
        {
            _tasksRunning++;
            await action();
        }
        finally
        {
            _tasksRunning--;
        }
    };

    private async Task InvokeAsync(Action action)
    {
        await Dispatcher.InvokeAsync(() => {
            try
            {
                _tasksRunning++;
                _currentInvocationTcs = new TaskCompletionSource();
                MakeSurePendingTasksNotNull();
                action();
            }
            catch (Exception e)
            {
                HandleException(e);
            }
            finally
            {
                _currentInvocationTcs = null;
                _tasksRunning--;
            }
        }).ConfigureAwait(false);
    }
    
    private async Task WaitForQuiescence()
    {
        _logger.LogTrace("Waiting for quiescence");
        await (Task) WaitForQuiescenceMethod.Invoke(this, [])!;
        MakeSurePendingTasksNotNull();
    }
    
    private void MakeSurePendingTasksNotNull()
    {
        if (GetPendingTaskCount() is null)
            PendingTasksField.SetValue(this, new List<Task>());
    }
    
    int? GetPendingTaskCount()
    {
        var pendingTasks = PendingTasksField.GetValue(this) as List<Task>;
        return pendingTasks?.Count;
    }
    
    private LightModeResponse CreateLightModeResponse()
    {
        var renderBatches = GetSerializedRenderBatches();
        var invokeJsInfos = _jsRuntime.GetInvokeJsQueue();
        var renderCompleted = _tasksRunning == 0;
        
        return new LightModeResponse(renderBatches, invokeJsInfos, renderCompleted);
    }
    public void TryForceRender()
    {
        if (IsInitialRender)
            return;
        
        if (_currentInvocationTcs is { Task.IsCompleted: false} tcs)
            tcs.SetResult();
    }
    
    public Task<LightModeRootComponent> RenderComponentAsync(Type componentType)
    {
        _logger.LogTrace("Rendering component {ComponentType}", componentType);
        
        return Dispatcher.InvokeAsync(async () => {
            var content = BeginRenderingComponent(componentType, ParameterView.Empty);
            await content.QuiescenceTask;
            return content;
        });
    }
    
    private LightModeRootComponent BeginRenderingComponent(Type componentType, ParameterView parameters)
    {
        var component = InstantiateComponent(componentType);
        return BeginRenderingComponent(component, parameters);
    }

    private LightModeRootComponent BeginRenderingComponent(IComponent component, ParameterView initialParameters)
    {
        var componentId = AssignRootComponentId(component);
        var quiescenceTask = RenderRootComponentAsync(componentId, initialParameters);

        if (quiescenceTask.IsFaulted)
            ExceptionDispatchInfo.Capture(quiescenceTask.Exception.InnerException ?? quiescenceTask.Exception).Throw();

        return new LightModeRootComponent(this, componentId, quiescenceTask);
    }

    protected override void HandleException(Exception exception)
    {
        Console.WriteLine(exception);
        throw exception;
    }
    
    protected override void AttachRootComponentToBrowser(int componentId, string domElementSelector) => Console.WriteLine($"Attaching component {componentId} to {domElementSelector}");
    protected override IComponent ResolveComponentForRenderMode(Type componentType, int? parentComponentId, IComponentActivator componentActivator, IComponentRenderMode renderMode)
        => componentActivator.CreateInstance(componentType);

    record EventDescriptor(ulong EventHandlerId, string EventName, EventFieldInfo? EventFieldInfo);
}

#pragma warning restore BL0006
