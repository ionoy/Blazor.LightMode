using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace Blazor.LightMode;

public class LightModeRendererEvents(ILogger<LightModeRendererEvents> logger)
{
    private readonly ConcurrentDictionary<int, EventAwaiter> _eventAwaiters = new();
    private readonly ConcurrentQueue<EventAwaiter> _toRemove = new();
    private int _awaitersId;
    private int _tasks;
    public bool HasActiveInvocations => _tasks > 0;

    public Task WaitFor(EventKind eventKind)
    {
        if (Interlocked.CompareExchange(ref _tasks, 0, 0) == 0)
            return Task.CompletedTask;
        
        var id = Interlocked.Increment(ref _awaitersId);
        var eventAwaiter = new EventAwaiter(id, eventKind);
        
        _eventAwaiters.TryAdd(id, eventAwaiter);
        
        return eventAwaiter.GetAwaiter();
    }
    
    public void NotifyRenderBatchReceived()
    {
        logger.LogTrace("Render batch received");
        NotifyAndRemove(EventKind.RenderBatchReceived);
    }

    public void NotifyJSCall()
    {
        logger.LogTrace("JS call received");
        NotifyAndRemove(EventKind.JSCall);
    }

    public void PushTask(int taskId)
    {
        Interlocked.Increment(ref _tasks);
        logger.LogTrace("Push task {TaskId}: {Tasks}", taskId, _tasks);
        NotifyAndRemove(EventKind.PushInvocation);
    }

    public void PopTask(int taskId)
    {
        Interlocked.Decrement(ref _tasks);
        logger.LogTrace("Pop task {TaskId}: ({Tasks} remaining)", taskId, _tasks);
        NotifyAndRemove(EventKind.PopInvocation);
    }
    
    private void NotifyAndRemove(EventKind eventKind)
    {
        foreach (var eventAwaiter in _eventAwaiters)
        {
            if ((eventAwaiter.Value.EventKind & eventKind) == eventKind)
            {
                eventAwaiter.Value.OnCompleted();
                _toRemove.Enqueue(eventAwaiter.Value);
            }
        }

        RemoveCompletedAwaiters();
    }
    
    private void RemoveCompletedAwaiters()
    {
        while (_toRemove.TryDequeue(out var awaiter))
            _eventAwaiters.TryRemove(awaiter.Id, out _);
    }

    internal class EventAwaiter(int id, EventKind eventKind)
    {
        public int Id { get; } = id;
        public EventKind EventKind { get; private set; } = eventKind;
        public bool IsCompleted => _tcs.Task.IsCompleted;

        private readonly TaskCompletionSource _tcs = new();
        private readonly object _lock = new();

        public Task GetAwaiter() => _tcs.Task;
        public void OnCompleted()
        {
            lock (_lock)
                _tcs.SetResult();
        }
    }
}

[Flags]
public enum EventKind
{
    RenderBatchReceived = 1,
    JSCall = 2,
    PushInvocation = 4,
    PopInvocation = 8
}