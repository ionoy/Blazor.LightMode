using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Rendering;
using Microsoft.AspNetCore.Components.RenderTree;
using Microsoft.AspNetCore.Components.Server.Circuits;
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
    // this should only be updated on the renderer dispatcher 
    private readonly ConcurrentDictionary<int, bool> _onAfterRenderSet = []; 
    private readonly Dictionary<int,ComponentState> _componentStateById;
    private readonly ILogger<LightModeRenderer> _logger;
    public bool IsInitialRender { get; set; } = true;

    private static readonly Task CanceledRenderTask = Task.FromCanceled(new CancellationToken(canceled: true));
    private static readonly FieldInfo PendingTasksField = typeof(Renderer).GetField("_pendingTasks", BindingFlags.NonPublic | BindingFlags.Instance)!;
    private static readonly MethodInfo WaitForQuiescenceMethod = typeof(Renderer).GetMethod("WaitForQuiescence", BindingFlags.NonPublic | BindingFlags.Instance)!;
    private static readonly FieldInfo ComponentStateByIdField = typeof(Renderer).GetField("_componentStateById", BindingFlags.NonPublic | BindingFlags.Instance)!;
    public override Dispatcher Dispatcher { get; } = Dispatcher.CreateDefault();
    public LightModeRendererEvents RendererEvents { get; }
    
    public LightModeRenderer(IServiceProvider serviceProvider, ILoggerFactory loggerFactory) 
        : base(serviceProvider, loggerFactory, new JsonSerializerOptions(), new JSComponentInterop(new JSComponentConfigurationStore() {}))
    {
        RendererEvents = serviceProvider.GetRequiredService<LightModeRendererEvents>();
        
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
            _onAfterRenderSet.TryAdd(diff.ComponentId, true);
        
        RendererEvents.NotifyRenderBatchReceived();
        
        _logger.LogTrace("Added render batch to queue: {RenderBatchCount}", _renderBatchQueue.Count);
        
        if (!LightModeOptions.MergeAfterRender)
            return CanceledRenderTask;

        return Task.CompletedTask;
    }
    
    private void EnqueueSerializedRenderBatch(RenderBatch renderBatch)
    {
        using var memoryStream = new MemoryStream();
        using var renderBatchWriter = new RenderBatchWriter(memoryStream, false);
        
        renderBatchWriter.Write(in renderBatch);
        var base64 = Convert.ToBase64String(memoryStream.ToArray());
        _renderBatchQueue.Enqueue(base64);
    }

    public async Task InvokeOnAfterRender()
    {
        var taskList = new List<Task>();
        var onAfterRenderSet = _onAfterRenderSet.ToArray();
        
        _onAfterRenderSet.Clear();
        
        foreach (var (componentId, _) in onAfterRenderSet)
        {
            if (_componentStateById.TryGetValue(componentId, out var componentState) && componentState.Component is IHandleAfterRender handleAfterRender)
            {
                _logger.LogTrace("Invoking OnAfterRenderAsync for component {Component}", componentState.Component);
                taskList.Add(handleAfterRender.OnAfterRenderAsync());
            }
        }
            
        await Task.WhenAll(taskList);
    }

    private async Task WaitForQuiescence()
    {
        
        
        _logger.LogTrace("Waiting for quiescence");
        await (Task) WaitForQuiescenceMethod.Invoke(this, [])!;
        MakeSurePendingTasksNotNull();
    }

    public void MakeSurePendingTasksNotNull()
    {
        if (GetPendingTaskCount() is null)
            PendingTasksField.SetValue(this, new List<Task>());
    }
    
    int? GetPendingTaskCount()
    {
        var pendingTasks = PendingTasksField.GetValue(this) as List<Task>;
        return pendingTasks?.Count;
    }

    public LightModeResponse CreateLightModeResponse()
    {
        var renderBatches = GetSerializedRenderBatches();
        var invokeJsInfos = _jsRuntime.GetInvokeJsQueue();
        var renderCompleted = !RendererEvents.HasActiveInvocations;
        
        return new LightModeResponse(renderBatches, invokeJsInfos, renderCompleted, !LightModeOptions.MergeAfterRender && renderBatches.Count > 0);
    }
    
    public LightModeRootComponent RenderComponent(Type componentType, ParameterView? parameters = null)
    {
        parameters ??= ParameterView.Empty;
        _logger.LogTrace("Rendering component {ComponentType}", componentType);
        var component = InstantiateComponent(componentType);
        return BeginRenderingComponent(component, parameters.Value);
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
}

#pragma warning restore BL0006
