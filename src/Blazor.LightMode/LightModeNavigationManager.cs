using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Routing;
using Microsoft.JSInterop;

namespace Blazor.LightMode;

public class LightModeNavigationManager(IJSRuntime jsRuntime) : NavigationManager
{
    private const string NavigateToMethod = "Blazor._internal.navigationManager.navigateTo";

    public new void Initialize(string baseUri, string uri)
    {
        base.Initialize(baseUri, uri);
        NotifyLocationChanged(isInterceptedLink: false);
    }

    public void NotifyLocationChanged(string location)
    {
        Uri = location;
        NotifyLocationChanged(isInterceptedLink: false);
    }

    protected override void NavigateToCore(string uri, NavigationOptions options)
    {
        _ = PerformNavigationAsync();

        async Task PerformNavigationAsync()
        {
            try
            {
                var shouldContinueNavigation = await NotifyLocationChangingAsync(uri, options.HistoryEntryState, false);

                if (!shouldContinueNavigation)
                {
                    Console.WriteLine("Navigation was canceled: " + uri);
                    return;
                }

                await jsRuntime.InvokeVoidAsync(NavigateToMethod, uri, options);
            }
            catch (TaskCanceledException)
            {
                Console.WriteLine("Navigation was canceled: " + uri);
            }
            catch (Exception ex)
            {
                Console.WriteLine("An unhandled exception occurred while navigating to " + uri + ": " + ex);
            }
        }
    }

    protected override void EnsureInitialized()
    {
    }
}
