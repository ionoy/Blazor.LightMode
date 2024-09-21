using Microsoft.JSInterop;

namespace Blazor.LightMode;

public record InvokeJsInfo(long TaskId, string Identifier, string? ArgsJson, JSCallResultType ResultType, long TargetInstanceId);
public record LightModeResponse(IReadOnlyList<string> SerializedRenderBatches, IReadOnlyList<InvokeJsInfo> InvokeJsInfos, bool RenderCompleted, bool NeedsAfterRender);