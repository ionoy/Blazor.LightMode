using Microsoft.AspNetCore.Components.Routing;

namespace Blazor.LightMode;

public class LightModeNavigationInterception : INavigationInterception
{
    public Task EnableNavigationInterceptionAsync() => Task.CompletedTask;
}