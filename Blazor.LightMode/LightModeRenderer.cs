using System.Collections.Concurrent;
using System.Diagnostics.CodeAnalysis;
using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.RenderTree;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.Web.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Blazor.LightMode;

#pragma warning disable BL0006
public partial class LightModeRenderer : WebRenderer
{
    public LightModeJSRuntime JSRuntime { get; } = new();

    private readonly ConcurrentQueue<string> _renderBatchQueue = [];
    private readonly LightModeInteropMethods _interopMethods;
    private readonly LightModeNavigationManager _navigationManager;

    private static readonly Task CanceledRenderTask = Task.FromCanceled(new CancellationToken(canceled: true));
    private static readonly FieldInfo PendingTasksField = typeof(Renderer).GetField("_pendingTasks", BindingFlags.NonPublic | BindingFlags.Instance)!;
    private static readonly MethodInfo WaitForQuiescenceMethod = typeof(Renderer).GetMethod("WaitForQuiescence", BindingFlags.NonPublic | BindingFlags.Instance)!;
    
    public LightModeRenderer(IServiceProvider serviceProvider, ILoggerFactory loggerFactory, LightModeCircuit circuit) 
        : base(serviceProvider, loggerFactory, new JsonSerializerOptions(), new JSComponentInterop(new JSComponentConfigurationStore() {}))
    {
        _navigationManager = serviceProvider.GetRequiredService<NavigationManager>() as LightModeNavigationManager ?? throw new InvalidOperationException("The NavigationManager must be an instance of LightModeNavigationManager");
        _htmlEncoder = serviceProvider.GetService<HtmlEncoder>() ?? HtmlEncoder.Default;
        _javaScriptEncoder = serviceProvider.GetService<JavaScriptEncoder>() ?? JavaScriptEncoder.Default;
        _interopMethods = new LightModeInteropMethods(this);
    }
    
    public override Dispatcher Dispatcher { get; } = Dispatcher.CreateDefault();

    public Task<LightModeRootComponent> RenderComponentAsync<TComponent>() where TComponent : IComponent
    {
        return Dispatcher.InvokeAsync(async () => {
            var content = BeginRenderingComponent(typeof(TComponent), ParameterView.Empty);
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
    
    public async Task InvokeMethodAsync(string? assemblyName, string? methodIdentifier, JsonElement[] args)
    {
        if (methodIdentifier == nameof(LightModeInteropMethods.DispatchEventAsync))
        {
            if (args.Length != 2)
                throw new ArgumentException("The number of arguments must be 2");
            
            await _interopMethods.DispatchEventAsync(args[0], args[1]);
        }
    }
    public IReadOnlyList<string> GetSerializedRenderBatches()
    {
        var batches = new List<string>();
        while (_renderBatchQueue.TryDequeue(out var batch))
            batches.Add(batch);
        return batches;
    }
    
    private void MakeSurePendingTasksNotNull()
    {
        if (PendingTasksField.GetValue(this) is null)
            PendingTasksField.SetValue(this, new List<Task>());
    }

    protected override Task UpdateDisplayAsync(in RenderBatch renderBatch)
    {
        using var memoryStream = new MemoryStream();
        using var renderBatchWriter = new RenderBatchWriter(memoryStream, false);
        
        renderBatchWriter.Write(in renderBatch);
        var base64 = Convert.ToBase64String(memoryStream.ToArray());
        _renderBatchQueue.Enqueue(base64);
        MakeSurePendingTasksNotNull();
        
        return CanceledRenderTask;
    }
    
    public async Task LocationChanged(string location)
    {
        await Dispatcher.InvokeAsync(async () => {
            MakeSurePendingTasksNotNull();
            _navigationManager.NotifyLocationChanged(location);
            await (Task)WaitForQuiescenceMethod.Invoke(this, [])!;
        }).ConfigureAwait(false);
    }
}

#pragma warning restore BL0006
