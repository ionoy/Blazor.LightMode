using System.Collections.Concurrent;

namespace Blazor.LightMode;

public class LightModeRendererEvents
{
    private readonly ConcurrentDictionary<int, EventAwaiter> _eventAwaiters = new();
    private readonly ConcurrentQueue<EventAwaiter> _toRemove = new();
    private int _awaitersId;
    private int _invocations;
    public bool HasActiveInvocations => _invocations > 0;

    public Task WaitFor(EventKind eventKind)
    {
        if (Interlocked.CompareExchange(ref _invocations, 0, 0) == 0)
            return Task.CompletedTask;
        
        var id = Interlocked.Increment(ref _awaitersId);
        var eventAwaiter = new EventAwaiter(id, eventKind);
        
        _eventAwaiters.TryAdd(id, eventAwaiter);
        
        return eventAwaiter.GetAwaiter();
    }
    
    public void NotifyRenderBatchReceived() => NotifyAndRemove(EventKind.RenderBatchReceived);

    public void NotifyJSCall() => NotifyAndRemove(EventKind.JSCall);

    public void PushInvocation()
    {
        Console.WriteLine("PushInvocation");
        Interlocked.Increment(ref _invocations);
        NotifyAndRemove(EventKind.PushInvocation);
    }

    public void PopInvocation()
    {
        Console.WriteLine("PopInvocation");
        Interlocked.Decrement(ref _invocations);
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