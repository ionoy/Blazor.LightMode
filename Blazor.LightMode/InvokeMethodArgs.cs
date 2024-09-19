using System.Text.Json;

namespace Blazor.LightMode;

public record struct InvokeMethodArgs(string RequestId, string? AssemblyName, string MethodIdentifier, int ObjectReference, JsonElement[] Arguments);
public record struct LocationChangedArgs(string RequestId, string Location);
public record struct AfterRenderArgs(string RequestId);
public record struct EndInvokeJSFromDotNetArgs(string RequestId, int? AsyncHandle, bool Success, string Result);
public record struct WaitForRenderArgs(string RequestId);
public record struct UnloadArgs(string RequestId);