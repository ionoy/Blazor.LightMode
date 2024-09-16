using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Endpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Blazor.LightMode;

public static class LightModeExtensions
{
    public static void AddLightMode(this IServiceCollection services)
    {
        services.Replace(new ServiceDescriptor(typeof(NavigationManager), typeof(LightModeNavigationManager), ServiceLifetime.Scoped));
        services.AddSingleton<LightModeCircuitHost>();
        services.AddScoped<IRazorComponentEndpointInvoker, LightModeEndpointInvoker>();
    }

    public static void UseLightMode(this WebApplication app)
    {
        app.MapPost("/_invokeMethodAsync", async (HttpContext context, [FromServices]LightModeCircuitHost host, [FromBody]InvokeMethodArgs args) => {
            var response = await host.InvokeMethodAsync(args.RequestId, args.AssemblyName, args.MethodIdentifier, args.ObjectReference, args.Arguments);
            await context.Response.WriteAsJsonAsync(response);
        });

        app.MapPost("/_locationChanged", async (HttpContext context, [FromServices]LightModeCircuitHost host, [FromBody]LocationChangedArgs args) => {
            var response = await host.LocationChangedAsync(args.RequestId, args.Location);
            await context.Response.WriteAsJsonAsync(response);
        });

        app.MapPost("/_onAfterRender", async (HttpContext context, [FromServices]LightModeCircuitHost host, [FromBody]AfterRenderArgs args) => {
            var response = await host.OnAfterRenderAsync(args.RequestId);
            await context.Response.WriteAsJsonAsync(response);
        });
    }
}