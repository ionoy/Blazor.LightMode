using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace Blazor.LightMode;

public class DefaultLightModeCircuitManager : ILightModeCircuitManager
{
    private readonly ILogger<DefaultLightModeCircuitManager> _logger;
    private LightModeCircuitHost? _host;
    private readonly SemaphoreSlim _runGc = new (0);
    private readonly ConcurrentDictionary<string, DateTimeOffset> _circuitUsage = new();

    public static int MinimumCircuitCount = 10;
    public static int MaximumCircuitCount = 1000;
    public static TimeSpan CircuitTimeout = TimeSpan.FromHours(8);

    public DefaultLightModeCircuitManager(ILogger<DefaultLightModeCircuitManager> logger)
    {
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        Task.Run(async () => {
            while (!cancellationToken.IsCancellationRequested)
            {
                await _runGc.WaitAsync(TimeSpan.FromMinutes(10), cancellationToken);
                
                if (_host == null)
                    continue;
                
                _logger.LogDebug("Running circuit GC");
                
                var now = DateTimeOffset.Now;
                
                foreach (var (circuitId, lastUsage) in _circuitUsage.ToArray())
                {
                    if (now - lastUsage > CircuitTimeout)
                    {
                        _host.StopCircuit(circuitId);
                        _circuitUsage.TryRemove(circuitId, out _);
                        
                        _logger.LogInformation("Circuit {CircuitId} was stopped due to inactivity", circuitId);
                    }
                    
                    if (_circuitUsage.Count < MinimumCircuitCount)
                        break;
                }

                // If we have too many circuits, we need to stop some
                if (_circuitUsage.Count > MaximumCircuitCount)
                {
                    var stopCount = (_circuitUsage.Count - MaximumCircuitCount) + (MaximumCircuitCount - MinimumCircuitCount) / 2;
                    var circuitsToStop = _circuitUsage
                        .OrderBy(x => x.Value)
                        .Take(stopCount)
                        .Select(x => x.Key)
                        .ToArray();

                    foreach (var circuitId in circuitsToStop)
                    {
                        _host.StopCircuit(circuitId);
                        _circuitUsage.TryRemove(circuitId, out _);
                        
                        _logger.LogInformation("Circuit {CircuitId} was stopped due to high circuit count", circuitId);
                    }
                }
                
                await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken);
            }
        }, cancellationToken);

        return Task.CompletedTask;
    }
    
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    
    public void SetCircuitHost(LightModeCircuitHost host) => _host = host;

    public void OnNewCircuit(string circuitId)
    {
        _circuitUsage[circuitId] = DateTimeOffset.Now;

        if (_circuitUsage.Count > MaximumCircuitCount)
            _runGc.Release();
    }
    public void OnTask(string circuitId)
    {
        _circuitUsage[circuitId] = DateTimeOffset.Now;
    }
}