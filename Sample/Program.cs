using Blazor.LightMode;
using Microsoft.AspNetCore.Mvc;
using Sample.Components;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

builder.Services.AddLightMode();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();

app.UseStaticFiles();
app.UseAntiforgery();

app.MapGet("/", async (HttpContext context, [FromServices]LightModeCircuitHost host) => {
    await host.StartRequest<App>(context);
});

app.MapPost("/_invokeMethodAsync", async (HttpContext context, [FromServices]LightModeCircuitHost host, [FromBody]InvokeMethodArgs args) => {
    var response = await host.InvokeMethodAsync(args.RequestId, args.AssemblyName, args.MethodIdentifier, args.ObjectReference, args.Arguments);
    
    await context.Response.WriteAsJsonAsync(response);
});

app.MapPost("/_locationChanged", async (HttpContext context, [FromServices]LightModeCircuitHost host, [FromBody]LocationChangedArgs args) => {
    var response = await host.LocationChangedAsync(args.RequestId, args.Location);
    
    await context.Response.WriteAsJsonAsync(response);
});

app.Run();