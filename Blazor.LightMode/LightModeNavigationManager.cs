using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Routing;

namespace Blazor.LightMode;

public class LightModeNavigationManager : NavigationManager
{
    private string? _baseUri;
    
    public new void Initialize(string baseUri, string uri)
    {
        _baseUri = baseUri;
        
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

                var absoluteUri = _baseUri + uri;
                Uri = absoluteUri;
                
                NotifyLocationChanged(isInterceptedLink: false);
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