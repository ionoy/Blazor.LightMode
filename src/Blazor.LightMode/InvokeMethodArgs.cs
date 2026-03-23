using System.Text.Json;

namespace Blazor.LightMode;

public record struct InvokeMethodArgs(string RequestId, string? AssemblyName, string MethodIdentifier, int ObjectReference, JsonElement[] Arguments, long? AcknowledgedResponseId);
public record struct LocationChangedArgs(string RequestId, string Location, long? AcknowledgedResponseId);
public record struct AfterRenderArgs(string RequestId, long? AcknowledgedResponseId);
public record struct EndInvokeJSFromDotNetArgs(string RequestId, int? AsyncHandle, bool Success, string Result, long? AcknowledgedResponseId);
public record struct WaitForRenderArgs(string RequestId, long? AcknowledgedResponseId);
public record struct UnloadArgs(string RequestId);
