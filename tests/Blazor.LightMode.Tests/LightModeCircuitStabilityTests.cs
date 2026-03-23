using System.Text.Json;
using Blazor.LightMode;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Rendering;
using Microsoft.AspNetCore.Components.Routing;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Xunit;

namespace Blazor.LightMode.Tests;

public class LightModeCircuitStabilityTests
{
    private static readonly TimeSpan TestTimeout = TimeSpan.FromSeconds(5);

    [Fact]
    public async Task InvalidStaleEventHandlerId_DoesNotFreezeCircuit()
    {
        using var harness = await CircuitHarness.CreateAsync(typeof(DelayedAfterRenderComponent));

        var onAfterRenderResponse = await harness.Circuit.OnAfterRender().WaitAsync(TestTimeout);
        Assert.False(onAfterRenderResponse.RenderCompleted);

        _ = await harness.Circuit.InvokeMethodAsync(null, "DispatchEventAsync", 0, CreateStaleDispatchArgs()).WaitAsync(TestTimeout);

        var waitForRenderResponse = await harness.Circuit.WaitForRender().WaitAsync(TestTimeout);
        Assert.True(waitForRenderResponse.RenderCompleted);
    }

    [Fact]
    public async Task FollowUpNavigationInteraction_StillProducesRenderBatchesAfterStaleEvent()
    {
        using var harness = await CircuitHarness.CreateAsync(typeof(NavigationEchoComponent));

        _ = await harness.Circuit.EndInvokeJSFromDotNet(null, true, "null").WaitAsync(TestTimeout);
        _ = await harness.Circuit.InvokeMethodAsync(null, "DispatchEventAsync", 0, CreateStaleDispatchArgs()).WaitAsync(TestTimeout);

        var responses = new List<LightModeResponse>
        {
            await harness.Circuit.LocationChanged("https://localhost/next").WaitAsync(TestTimeout)
        };

        while (!responses[^1].RenderCompleted)
            responses.Add(await harness.Circuit.WaitForRender().WaitAsync(TestTimeout));

        Assert.Contains(responses, response => response.SerializedRenderBatches.Count > 0);
        Assert.True(responses[^1].RenderCompleted);
    }

    [Fact]
    public async Task WaitForRender_CompletesWhenInvocationFinishesWithoutRenderBatchOrJsCall()
    {
        using var harness = await CircuitHarness.CreateAsync(typeof(DelayedAfterRenderComponent));

        var onAfterRenderResponse = await harness.Circuit.OnAfterRender().WaitAsync(TestTimeout);
        Assert.False(onAfterRenderResponse.RenderCompleted);

        var waitForRenderResponse = await harness.Circuit.WaitForRender().WaitAsync(TestTimeout);
        Assert.True(waitForRenderResponse.RenderCompleted);
    }

    private static JsonElement[] CreateStaleDispatchArgs()
    {
        var eventDescriptor = JsonSerializer.SerializeToElement(new
        {
            eventHandlerId = ulong.MaxValue,
            eventName = "onclick",
            eventFieldInfo = (object?)null
        });

        var eventArgs = JsonSerializer.SerializeToElement(new { });

        return [eventDescriptor, eventArgs];
    }

    private class CircuitHarness(ServiceProvider rootServices, LightModeCircuit circuit) : IDisposable
    {
        public LightModeCircuit Circuit { get; } = circuit;

        public static async Task<CircuitHarness> CreateAsync(Type componentType)
        {
            var services = new ServiceCollection();
            services.AddLogging();
            services.AddSingleton<IConfiguration>(new ConfigurationBuilder().Build());

            var environment = new TestWebHostEnvironment
            {
                ContentRootPath = Directory.GetCurrentDirectory(),
                ContentRootFileProvider = new PhysicalFileProvider(Directory.GetCurrentDirectory()),
                WebRootPath = Directory.GetCurrentDirectory(),
                WebRootFileProvider = new PhysicalFileProvider(Directory.GetCurrentDirectory())
            };

            services.AddSingleton<IWebHostEnvironment>(environment);
            services.AddSingleton<IHostEnvironment>(environment);
            services.AddRazorComponents().AddInteractiveServerComponents();
            services.AddLightMode();

            var rootServices = services.BuildServiceProvider();
            var context = new DefaultHttpContext
            {
                RequestServices = rootServices
            };

            context.Request.Scheme = "https";
            context.Request.Host = new HostString("localhost");
            context.Request.Path = "/";
            context.Response.Body = new MemoryStream();

            var loggerFactory = rootServices.GetRequiredService<ILoggerFactory>();
            var circuit = new LightModeCircuit(context, Guid.NewGuid().ToString("N"), loggerFactory);
            var navigationManager = (LightModeNavigationManager)circuit.Services.GetRequiredService<NavigationManager>();
            navigationManager.Initialize("https://localhost/", "https://localhost/");

            await circuit.RenderRootComponentAsync(context, componentType);

            return new CircuitHarness(rootServices, circuit);
        }

        public void Dispose()
        {
            Circuit.Dispose();
            rootServices.Dispose();
        }
    }

    public class DelayedAfterRenderComponent : ComponentBase
    {
        protected override void BuildRenderTree(RenderTreeBuilder builder)
        {
            builder.OpenElement(0, "div");
            builder.AddContent(1, "Delayed");
            builder.CloseElement();
        }

        protected override Task OnAfterRenderAsync(bool firstRender)
            => Task.Delay(300);
    }

    private class TestWebHostEnvironment : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = nameof(LightModeCircuitStabilityTests);
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = string.Empty;
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ContentRootPath { get; set; } = string.Empty;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    public class NavigationEchoComponent : ComponentBase, IDisposable
    {
        [Inject] private NavigationManager NavigationManager { get; set; } = default!;

        private string _location = string.Empty;

        protected override void OnInitialized()
        {
            _location = NavigationManager.Uri;
            NavigationManager.LocationChanged += OnLocationChanged;
        }

        private void OnLocationChanged(object? sender, LocationChangedEventArgs args)
        {
            _ = InvokeAsync(async () =>
            {
                await Task.Yield();
                _location = args.Location;
                StateHasChanged();
            });
        }

        public void Dispose() => NavigationManager.LocationChanged -= OnLocationChanged;

        protected override void BuildRenderTree(RenderTreeBuilder builder)
        {
            builder.OpenElement(0, "p");
            builder.AddContent(1, _location);
            builder.CloseElement();
        }
    }
}
