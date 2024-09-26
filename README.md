# Blazor LightMode 🔆

Blazor rendering pipeline that uses browser `fetch` instead of SignalR

This means that you can:

* Forget about disconnected sessions
* Avoid paying for an expensive server
* Access your backend services without an API
  
  
[2024-09-23 11-31-47.webm](https://github.com/user-attachments/assets/fdd8148c-b1f5-4d76-a79d-d37136193585)

## Caution ⚠️

The project is still in the experimental phase. Very little real-world testing has been done, so please submit any issues you encounter here.

## Getting Started 🚀

### Installation 📦

Install the Blazor.LightMode NuGet package:

```bash
dotnet add package Blazor.LightMode
```

### Update `Program.cs`

Here's a sample application template with the necessary changes applied:

```csharp
using Blazor.LightMode;
using BlazorApp4.Components;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();
builder.Services.AddLightMode(); // ADD THIS LINE

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();

}

app.UseHttpsRedirection();

app.UseStaticFiles();
app.UseAntiforgery();

app.MapRazorComponents<App>();
  .AddInteractiveServerRenderMode(); // Optionally comment out this line
app.UseLightMode(); // ADD THIS LINE

app.Run();
```

### Update App.razor

Replace the existing Blazor script reference:

```html
<body>
  <Routes/>
  <script src="_framework/blazor.server.js"></script> // REMOVE THIS
  <script src="_content/Blazor.LightMode/blazor.lightmode.js"></script> // ADD THIS
</body>
```

## Build Your Application 🚀
You can now build your Blazor Server application as usual. All components and pages will function without persistent WebSocket connections.

## How It Works 🔧

Traditional Blazor Server uses SignalR to push render updates to the client. In contrast, LightMode is a traditional request/response model where the response acts as a push.

Blazor Server uses circuits to maintain the session state, and so does LightMode. The difference is that Blazor Server relies on the websocket disconnect event to handle circuit lifetime, while LightMode doesn't know if the client has disconnected. Instead, it utilizes a very simple garbage collection technique to dispose of sessions that are likely unused. If the user switches back to the tab after GC disposes of the session, the server will return a 404 response, prompting the browser to reload the page. You can configure GC values using `DefaultLightModeCircuitManager` static properties or implement your own `ILightModeCircuitManager`. 

## Contributing 🤝

Contributions are welcome! If you'd like to contribute, please follow these steps:

### How to build

* Fork the repo
* Run `git submodule update --init --recursive`
* Go to `src\Blazor.LightMode\js\` and run `npm install`
* Now open the solution file in the root directory and build

## Join Discord server👋

[https://discord.gg/CyRWCM4u](https://discord.gg/WzjgW4aj8E)

## License 📄

This project is licensed under the MIT License.

## Acknowledgements 🙏

[Blazor](https://dotnet.microsoft.com/apps/aspnet/web-apps/blazor)

[ASP.NET Core](https://dotnet.microsoft.com/apps/aspnet)
