using System.Text.Json;

namespace Blazor.LightMode;

public record struct InvokeMethodArgs(string RequestId, string? AssemblyName, string MethodIdentifier, int ObjectReference, JsonElement[] Arguments);
public record struct LocationChangedArgs(string RequestId, string Location);
public record struct AfterRenderArgs(string RequestId);