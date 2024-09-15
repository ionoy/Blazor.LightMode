using System.Collections.Concurrent;
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

    private readonly ConcurrentQueue<RenderBatchClone> _renderBatchQueue = [];
    private static readonly Task CanceledRenderTask = Task.FromCanceled(new CancellationToken(canceled: true));
    private readonly LightModeInteropMethods _interopMethods;
    
    public LightModeRenderer(IServiceProvider serviceProvider, ILoggerFactory loggerFactory, LightModeCircuit circuit) 
        : base(serviceProvider, loggerFactory, new JsonSerializerOptions(), new JSComponentInterop(new JSComponentConfigurationStore() {}))
    {
        serviceProvider.GetRequiredService<NavigationManager>();
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
    
    public LightModeRootComponent BeginRenderingComponent(
        IComponent component,
        ParameterView initialParameters)
    {
        var componentId = AssignRootComponentId(component);
        var quiescenceTask = RenderRootComponentAsync(componentId, initialParameters);

        if (quiescenceTask.IsFaulted)
            ExceptionDispatchInfo.Capture(quiescenceTask.Exception.InnerException ?? quiescenceTask.Exception).Throw();

        return new LightModeRootComponent(this, componentId, quiescenceTask);
    }

    protected override void HandleException(Exception exception) => throw exception;

    protected override Task UpdateDisplayAsync(in RenderBatch renderBatch)
    {
        _renderBatchQueue.Enqueue(new RenderBatchClone(renderBatch));
        return CanceledRenderTask;
    }
    
    protected override void AttachRootComponentToBrowser(int componentId, string domElementSelector)
    {
        Console.WriteLine($"Attaching component {componentId} to {domElementSelector}");
    }
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
            batches.Add(batch.SerializeToBase64());
        return batches;
    }
}

#pragma warning restore BL0006
