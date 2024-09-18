using System.Collections.Concurrent;
using System.Reflection;
using System.Text;
using System.Text.Json;
using Blazor.LightMode.DotNetInternals;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using Microsoft.JSInterop.Infrastructure;

namespace Blazor.LightMode;

public class LightModeJSRuntime : JSRuntime
{
    public LightModeRenderer? Renderer { get; set; }
    public new JsonSerializerOptions JsonSerializerOptions => base.JsonSerializerOptions;
    
    private readonly ConcurrentQueue<InvokeJsInfo> _invokeJsQueue = new();
    // internal bool EndInvokeJS(long taskId, bool succeeded, ref Utf8JsonReader jsonReader)
    private static readonly MethodInfo EndInvokeJSMethod = typeof(JSRuntime).GetMethod("EndInvokeJS", BindingFlags.NonPublic | BindingFlags.Instance)!;

    public LightModeJSRuntime()
    {
        JsonSerializerOptions.Converters.Add(new ElementReferenceJsonConverter(new WebElementReferenceContext(this)));
    }
    
    public IReadOnlyList<InvokeJsInfo> GetInvokeJsQueue()
    {
        var result = new List<InvokeJsInfo>();

        while (_invokeJsQueue.TryDequeue(out var invokeJsInfo))
            result.Add(invokeJsInfo);

        return result;
    }

    protected override void BeginInvokeJS(long taskId, string identifier, string? argsJson, JSCallResultType resultType, long targetInstanceId)
    {
        Console.WriteLine($"BeginInvokeJS: {taskId}, {identifier}, {argsJson}, {resultType}, {targetInstanceId}");
        
        _invokeJsQueue.Enqueue(new(taskId, identifier, argsJson, resultType, targetInstanceId));

        // if (resultType == JSCallResultType.JSVoidResult)
        // {
        //     // auto resolve void calls to prevent deadlocks and reduce chatter
        //     EndInvokeJSFromDotNet(taskId, true, null, true);
        //     return;
        // }
        
        Renderer?.TryForceRender();
    }
    
    protected override void EndInvokeDotNet(DotNetInvocationInfo invocationInfo, in DotNetInvocationResult invocationResult)
    {
        Console.WriteLine($"EndInvokeDotNet: {invocationInfo.CallId}, {invocationResult.Success}, {invocationResult.ResultJson}");
    }
    
    public bool EndInvokeJSFromDotNet(long? asyncHandle, bool success, string? result, bool isShortCircuit = false)
    {
        Console.WriteLine($"EndInvokeJSFromDotNet: {asyncHandle}, {success}, {result}, isShortCircuit: {isShortCircuit}");
        
        if (asyncHandle == null)
            return true;
        
        var buffer = Encoding.UTF8.GetBytes(result ?? "null");
        var reader = new Utf8JsonReader(buffer);
        var endInvokeJsMethodDelegate = EndInvokeJSMethod.CreateDelegate<EndInvokeJSMethodDelegate>(this);
        
        return endInvokeJsMethodDelegate((long)asyncHandle, success, ref reader);
    }
    
    delegate bool EndInvokeJSMethodDelegate(long taskId, bool succeeded, ref Utf8JsonReader jsonReader);
}
