using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using Microsoft.AspNetCore.Components.RenderTree;
using Microsoft.JSInterop;
using Microsoft.JSInterop.Infrastructure;

namespace Blazor.LightMode;

[SuppressMessage("Usage", "BL0006:Do not use RenderTree types")]
public class LightModeInteropMethods
{
    private readonly LightModeRenderer _renderer;
    public LightModeInteropMethods(LightModeRenderer renderer)
    {
        _renderer = renderer;
    }
    
    [JSInvokable]
    public async Task DispatchEventAsync(JsonElement eventDescriptorJson, JsonElement eventArgsJson)
    {
        var eventDescriptor = JsonSerializer.Deserialize<EventDescriptor>(eventDescriptorJson.GetRawText(), _renderer.JSRuntime.JsonSerializerOptions)!;
        var eventArgsType = _renderer.GetEventArgsType(eventDescriptor.EventHandlerId);
        var eventArgs = (EventArgs)JsonSerializer.Deserialize(eventArgsJson.GetRawText(), eventArgsType, _renderer.JSRuntime.JsonSerializerOptions)!;

        await _renderer.Dispatcher.InvokeAsync(() => _renderer.DispatchEventAsync(eventDescriptor.EventHandlerId, eventDescriptor.EventFieldInfo, eventArgs));
    }

    // [JSInvokable] // Linker preserves this if you call RootComponents.Add
    // public int AddRootComponent(string identifier, string domElementSelector)
    //     => _jsComponentInterop.AddRootComponent(identifier, domElementSelector);
    //
    // [JSInvokable] // Linker preserves this if you call RootComponents.Add
    // public void SetRootComponentParameters(int componentId, int parameterCount, JsonElement parametersJson)
    //     => _jsComponentInterop.SetRootComponentParameters(componentId, parameterCount, parametersJson, _jsonOptions);
    //
    // [JSInvokable] // Linker preserves this if you call RootComponents.Add
    // public void RemoveRootComponent(int componentId)
    //     => _jsComponentInterop.RemoveRootComponent(componentId);
    record EventDescriptor(ulong EventHandlerId, string EventName, EventFieldInfo? EventFieldInfo);
}

public class LightModeJSRuntime : JSRuntime
{
    public new JsonSerializerOptions JsonSerializerOptions => base.JsonSerializerOptions;
    
    protected override void BeginInvokeJS(long taskId, string identifier, string? argsJson, JSCallResultType resultType, long targetInstanceId)
    {
        throw new NotImplementedException();
    }
    protected override void EndInvokeDotNet(DotNetInvocationInfo invocationInfo, in DotNetInvocationResult invocationResult)
    {
        throw new NotImplementedException();
    }
}