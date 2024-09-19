using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Endpoints;
using Microsoft.AspNetCore.Components.Routing;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.JSInterop;

namespace Blazor.LightMode;

public static class LightModeExtensions
{
    public static void AddLightMode(this IServiceCollection services)
    {
        services.Replace(new ServiceDescriptor(typeof(NavigationManager), typeof(LightModeNavigationManager), ServiceLifetime.Scoped));
        services.AddSingleton<LightModeCircuitHost>();
        services.AddScoped<LightModeRendererEvents>();
        services.AddScoped<IRazorComponentEndpointInvoker, LightModeEndpointInvoker>();
        services.AddScoped<LightModeJSRuntime>();
        services.AddScoped<IJSRuntime>(provider => provider.GetRequiredService<LightModeJSRuntime>());
        services.AddScoped<JSRuntime>(provider => provider.GetRequiredService<LightModeJSRuntime>());
        services.AddScoped<INavigationInterception, LightModeNavigationInterception>();
        services.AddScoped<IScrollToLocationHash, LightModelScrollToLocationHash>();
    }

    public static void UseLightMode(this WebApplication app)
    {
        app.MapPost("/_invokeMethodAsync", async (HttpContext context, [FromServices]LightModeCircuitHost host, [FromBody]InvokeMethodArgs args) => {
            if (await host.InvokeMethod(args.RequestId, args.AssemblyName, args.MethodIdentifier, args.ObjectReference, args.Arguments) is {} response)
                await context.Response.WriteAsJsonAsync(response);
            else
                context.Response.StatusCode = StatusCodes.Status404NotFound;
        });

        app.MapPost("/_locationChanged", async (HttpContext context, [FromServices]LightModeCircuitHost host, [FromBody]LocationChangedArgs args) => {
            if (await host.LocationChanged(args.RequestId, args.Location) is {} response)
                await context.Response.WriteAsJsonAsync(response);
            else
                context.Response.StatusCode = StatusCodes.Status404NotFound;
        });

        app.MapPost("/_onAfterRender", async (HttpContext context, [FromServices]LightModeCircuitHost host, [FromBody]AfterRenderArgs args) => {
            if (await host.OnAfterRender(args.RequestId) is {} response)
                await context.Response.WriteAsJsonAsync(response);
            else
                context.Response.StatusCode = StatusCodes.Status404NotFound;
        });
        
        app.MapPost("/_endInvokeJSFromDotNet", async (HttpContext context, [FromServices]LightModeCircuitHost host, [FromBody]EndInvokeJSFromDotNetArgs args) => {
            if (await host.EndInvokeJSFromDotNet(args.RequestId, args.AsyncHandle, args.Success, args.Result) is {} response)
                await context.Response.WriteAsJsonAsync(response);
            else
                context.Response.StatusCode = StatusCodes.Status404NotFound;
        });
        
        app.MapPost("/_waitForRender", async (HttpContext context, [FromServices]LightModeCircuitHost host, [FromBody]WaitForRenderArgs args) => {
            if (await host.WaitForRender(args.RequestId) is {} response)
                await context.Response.WriteAsJsonAsync(response);
            else
                context.Response.StatusCode = StatusCodes.Status404NotFound;
        });
    }
}