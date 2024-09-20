using Blazor.LightMode.DotNetInternals;
using Microsoft.AspNetCore.Components.Routing;
using Microsoft.JSInterop;

namespace Blazor.LightMode;

public class LightModelScrollToLocationHash : IScrollToLocationHash
{
    private readonly IJSRuntime _jsRuntime;
    
    public LightModelScrollToLocationHash(IJSRuntime jsRuntime)
    {
        _jsRuntime = jsRuntime;
    }

    public async Task RefreshScrollPositionForHash(string locationAbsolute)
    {
        var hashIndex = locationAbsolute.IndexOf("#", StringComparison.Ordinal);

        if (hashIndex > -1 && locationAbsolute.Length > hashIndex + 1)
        {
            var elementId = locationAbsolute[(hashIndex + 1)..];
            await _jsRuntime.InvokeVoidAsync(BrowserNavigationManagerInterop.ScrollToElement, elementId);
        }
    }
}