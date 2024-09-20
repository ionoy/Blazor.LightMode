using System.Diagnostics.CodeAnalysis;
using Microsoft.AspNetCore.Components.Endpoints;
using Microsoft.AspNetCore.Components.RenderTree;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace Blazor.LightMode;

[SuppressMessage("Usage", "BL0006:Do not use RenderTree types")]
public partial class LightModeEndpointInvoker : IRazorComponentEndpointInvoker
{
    private readonly LightModeCircuitHost _host;
    private readonly ILogger<LightModeEndpointInvoker> _logger;

    public LightModeEndpointInvoker(LightModeCircuitHost host,  ILogger<LightModeEndpointInvoker> logger)
    {
        _host = host;
        _logger = logger;
    }

    public async Task Render(HttpContext context)
    {
        var endpoint = context.GetEndpoint() ?? throw new InvalidOperationException($"An endpoint must be set on the '{nameof(HttpContext)}'.");

        var rootComponent = endpoint.Metadata.GetRequiredMetadata<RootComponentMetadata>().Type;
        var pageComponent = endpoint.Metadata.GetRequiredMetadata<ComponentTypeMetadata>().Type;

        Log.BeginRenderRootComponent(_logger, rootComponent.Name, pageComponent.Name);

        await _host.StartRequest(context, rootComponent);
    }

    public static partial class Log
    {
        [LoggerMessage(1, LogLevel.Debug, "Begin render root component '{componentType}' with page '{pageType}'.", EventName = nameof(BeginRenderRootComponent))]
        public static partial void BeginRenderRootComponent(ILogger<LightModeEndpointInvoker> logger, string componentType, string pageType);
    }
}
