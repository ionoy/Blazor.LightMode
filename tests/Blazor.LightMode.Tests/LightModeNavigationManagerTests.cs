using Blazor.LightMode;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using Microsoft.JSInterop.Infrastructure;
using stub0;
using Xunit;

namespace Blazor.LightMode.Tests;

public class LightModeNavigationManagerTests
{
    private const string NavigateToMethod = "Blazor._internal.navigationManager.navigateTo";

    [Fact]
    public async Task NavigateTo_QueuesBrowserNavigationBeforeRaisingLocationChanged()
    {
        using var jsVoidResult = Stub0.CreatePatched<IJSVoidResult>();
        var invokeCompleted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        string? identifier = null;
        object?[]? arguments = null;

        using var jsRuntime = Stub0.CreatePatched<IJSRuntime>()
            .On(x => x.InvokeAsync<IJSVoidResult>(NavigateToMethod, Arg.Any<object?[]?>()))
            .Do((string capturedIdentifier, object?[]? capturedArguments) =>
            {
                identifier = capturedIdentifier;
                arguments = capturedArguments;
                invokeCompleted.TrySetResult();
                return new ValueTask<IJSVoidResult>(jsVoidResult.Result);
            });

        var navigationManager = new LightModeNavigationManager(jsRuntime.Result);
        navigationManager.Initialize("https://localhost/", "https://localhost/");

        var locationChangedCount = 0;
        navigationManager.LocationChanged += (_, _) => locationChangedCount++;

        navigationManager.NavigateTo("/counter");

        await invokeCompleted.Task.WaitAsync(TimeSpan.FromSeconds(1));

        Assert.Equal(NavigateToMethod, identifier);
        Assert.NotNull(arguments);
        Assert.Equal("/counter", arguments![0]);

        var options = Assert.IsType<NavigationOptions>(arguments[1]);
        Assert.False(options.ForceLoad);
        Assert.False(options.ReplaceHistoryEntry);
        Assert.Equal("https://localhost/", navigationManager.Uri);
        Assert.Equal(0, locationChangedCount);

        navigationManager.NotifyLocationChanged("https://localhost/counter");

        Assert.Equal("https://localhost/counter", navigationManager.Uri);
        Assert.Equal(1, locationChangedCount);
        jsRuntime.Verify(x => x.InvokeAsync<IJSVoidResult>(NavigateToMethod, Arg.Any<object?[]?>()), Times.Once);
    }
}
