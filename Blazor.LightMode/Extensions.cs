using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Blazor.LightMode;

public static class Extensions
{
    public static void AddLightMode(this IServiceCollection services)
    {
        services.Replace(new ServiceDescriptor(typeof(NavigationManager), typeof(LightModeNavigationManager), ServiceLifetime.Scoped));
        services.AddSingleton<LightModeCircuitHost>();
    }
}