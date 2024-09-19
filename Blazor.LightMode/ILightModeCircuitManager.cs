using Microsoft.Extensions.Hosting;

namespace Blazor.LightMode;

public interface ILightModeCircuitManager : IHostedService
{
    void SetCircuitHost(LightModeCircuitHost host);
    void OnNewCircuit(string circuitId);
    void OnTask(string circuitId);
}