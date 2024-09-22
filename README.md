# Blazor LightMode 🎉

Create Blazor Server applications without persistent WebSocket connections.

Blazor LightMode is a library that allows you to build Blazor Server applications without the need for persistent WebSocket connections. By eliminating the dependency on SignalR and WebSockets, you can simplify deployment, improve scalability, and operate in environments where WebSockets are not supported.

## Why Blazor LightMode? 🤔

Blazor Server apps traditionally use SignalR and WebSockets to maintain real-time communication between the client and the server. While this enables powerful interactive features, it also introduces complexity and requires persistent connections, which can be a challenge in certain hosting environments.

Blazor LightMode addresses this by:

- **Simplifying Networking Requirements**: Operate over standard HTTP without the need for WebSocket support.
- **Reducing Server Load**: Eliminate the overhead of maintaining numerous persistent connections.
- **Improving Compatibility**: Deploy your Blazor Server apps in environments where WebSockets are restricted or unavailable.

## How It Works 🔧

Blazor LightMode replaces the traditional duplex communication model with a client-initiated request-response pattern:

1. **Client Requests**: The client sends a request to the server whenever it needs data or an update.
2. **Server Responses**: The server processes the request and returns the required data along with a flag indicating if more data is available.
3. **Polling Mechanism**: If more data is available, the client continues to send requests until all updates are received.

This approach ensures that all communication is initiated by the client, effectively removing the need for persistent connections and server-initiated communication.

## Pros and Cons ⚖️

### Pros ✅

- **Simplified Deployment**: No need to configure or support WebSocket connections on your server or in your network infrastructure.
- **Enhanced Scalability**: Reduced server resource usage by eliminating the overhead of managing persistent connections.
- **Greater Compatibility**: Works in environments where WebSockets are blocked or not supported, such as certain corporate networks or older browsers.

### Cons ❌

- **No Real-Time Server Push**: The server cannot push updates to the client without a client request.
- **Increased Latency**: Data updates may have slight delays due to the polling nature of client requests.
- **Less Suitable for Real-Time Applications**: Not ideal for applications that require instant updates, such as live chats or real-time dashboards.

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

* Fork the repository.
* Create a new branch for your feature or bugfix.
* Commit your changes with clear messages.
* Open a pull request detailing your changes.

## License 📄

This project is licensed under the MIT License.

## Acknowledgements 🙏

[Blazor](https://dotnet.microsoft.com/apps/aspnet/web-apps/blazor)

[ASP.NET Core](https://dotnet.microsoft.com/apps/aspnet)
