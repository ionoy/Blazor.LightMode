namespace Blazor.LightMode.DotNetInternals;

internal static class BrowserNavigationManagerInterop
{
#nullable disable
    private const string Prefix = "Blazor._internal.navigationManager.";
#nullable enable
    public const string EnableNavigationInterception = "Blazor._internal.navigationManager.enableNavigationInterception";
    public const string GetLocationHref = "Blazor._internal.navigationManager.getLocationHref";
    public const string GetBaseUri = "Blazor._internal.navigationManager.getBaseURI";
    public const string NavigateTo = "Blazor._internal.navigationManager.navigateTo";
    public const string Refresh = "Blazor._internal.navigationManager.refresh";
    public const string SetHasLocationChangingListeners = "Blazor._internal.navigationManager.setHasLocationChangingListeners";
    public const string ScrollToElement = "Blazor._internal.navigationManager.scrollToElement";
}