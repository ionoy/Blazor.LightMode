# Blazor LightMode 🎉

Write Blazor applications without requiring WebAssembly or persistent connections (web sockets).

LightMode functions like a regular Blazor Server application but uses `fetch` to request render updates from the server. This means that external services can't initiate DOM updates by calling `StateHasChanged`, but you still can write code like this:

```cs
  public async Task OnClick()
  {
    for (var i = 0; i < 10; i++)
    {
      _counter++;
      StateHasChanged();
      await Task.Delay(1000);
    }
  }
```

## Caution ⚠️

The project is still in the experimental phase. Very little real-world testing has been done, so please submit any issues you encounter here.

## Why Blazor LightMode? 🤔

Blazor is a fantastic framework that blurs the lines between the frontend and backend. So much of the complexity is removed when you can directly attach C# event handlers to HTML elements. You can directly use your backend infrastructure without thinking about requests, endpoints, viewmodels, mappers, etc. But this comes at a cost. Most of us have realized by now that Blazor Server is not very well suited for public-facing applications. Showing the end-user an "Attempting to reconnect to the server" just because they switched the tab for too long is just bad UX.
Microsoft tried to remedy that by introducing WebAssembly and later Auto render modes. In my opinion, this loses most of the advantages that Blazor offers. Sure, you can still write your code in C#. But once more, you need to rely on REST APIs to access the backend. The translation layer complexities that we removed with Blazor Server are now back. As for Static rendering mode, it feels like what we did 20 years ago. Not fun.

Blazor LightMode is for people who want to write interactive web applications that can be deployed to relatively cheap, public-facing servers. It's far from perfect, but this is what I wanted from Blazor Server all along. 

## How It Works 🔧

Blazor LightMode replaces the traditional duplex communication model with a client-initiated request-response pattern:

1. **Client Requests**: The client sends a request to the server to invoke an event handler.
2. **Server Responses**: The server processes the request and returns the required data along with a flag indicating if more data is available.
3. **Polling Mechanism**: If more data is available, the client continues to send requests until all updates are received.

This approach ensures that all communication is initiated by the client, effectively removing the need for persistent connections and server-initiated communication.

Of course, there's a catch. Blazor Server uses circuits to maintain session state, and so does LightMode. The difference is that Blazor Server relies on the websocket disconnect event to handle circuit lifetime, while LightMode doesn't know if the client has disconnected. Instead it utilizes a very simple garbage collection technique to dispose of sessions that are likely unused. If the user switches back to the tab after the session was disposed of by GC, the server will return a 404 response, prompting the browser to reload the page. It's not an ideal situation, but nothing drastic as well. You can configure GC values using `DefaultLightModeCircuitManager` static properties, or you can implement your own `ILightModeCircuitManager`. 

## Getting Started 🚀

### Installation 📦

Install the Blazor.LightMode NuGet package:

```bash
dotnet add package Blazor.LightMode
```

## Configuration ⚙️

### Update `Program.cs`

Add the following using directive:

```csharp
using Blazor.LightMode;
```

Register Blazor LightMode services:

```csharp
builder.Services.AddLightMode();
```

Configure the middleware:

```csharp
app.UseLightMode();
```

Remove or comment out the following line if present:

```csharp
app.AddInteractiveServerRenderMode();
```

Update App.razor
Replace the existing Blazor script reference:

```html
<script src="_framework/blazor.server.js"></script>
```

With the Blazor LightMode script:

```html
<script src="_content/Blazor.LightMode/blazor.lightmode.js"></script>
```

## Build Your Application 🚀
You can now build your Blazor Server application as usual. All components and pages will function without persistent WebSocket connections.

## Contributing 🤝

Contributions are welcome! If you'd like to contribute, please follow these steps:

### How to build

* Fork the repo
* Go to `src\Blazor.LightMode\js\` and run `npm install`
* Now open the solution file in the root directory and build

## License 📄

This project is licensed under the MIT License.

## Acknowledgements 🙏

[Blazor](https://dotnet.microsoft.com/apps/aspnet/web-apps/blazor)

[ASP.NET Core](https://dotnet.microsoft.com/apps/aspnet)
