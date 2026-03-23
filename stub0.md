# stub0 docs aggregate

This file is generated from markdown files under docs/.
Regenerate with ./generate-llms.ps1.

## docs/README.md


## docs/cheatsheet.md

# stub0 Cheatsheet

This page covers the exported `stub0` surface only:
`Stub0`, `Stub0<T>`, `Stub0TypeScope`, `Arg`, `Times`, `IOnBuilder<,>`, `ISequenceBuilder`,
`CallContext`, `WrapContext`, `ConstructorContext`, `InvocationRecord`, `RefBox<T>`, and `OutBox<T>`.

It intentionally excludes repo-internal helpers such as `Stub0Call`.

## Entry Points

```csharp
using stub0;

using var patched = Stub0.CreatePatched<IClock>();

var realClock = new Clock();
using var instanceScope = Stub0.CreatePatchingScope(realClock);

using var staticScope = Stub0.CreatePatchingScope<SystemClock>();
using var staticClassScope = Stub0.CreatePatchingScope(typeof(Console));
```

- `Stub0.CreatePatched<T>()`: create an isolated patched object or interface proxy.
- `Stub0.CreatePatched<T>(bool strictRuntimeSafety)`: same, but fail fast if runtime patch validation detects an unsafe state.
- `Stub0.CreatePatchingScope(instance)`: patch one existing instance until dispose.
- `Stub0.CreatePatchingScope<TStatic>()`: patch static members until dispose; constructor hooks are class-only.
- `Stub0.CreatePatchingScope(typeof(MyStaticClass))`: patch static members on a static class until dispose.
- `Stub0.CreatePatchingScope(..., bool throwIfPatched)` and `Stub0.CreatePatchingScope(..., TimeSpan lockTimeout)`: control overlapping scope ownership.
- `Stub0<T>.Result`: the usable object for patched instances and existing-instance scopes. Static scopes do not have a `Result`.
- `Stub0<T>` also has an implicit conversion to `T`, but `Result` is usually clearer.

## Configure Behavior

```csharp
using var stub = Stub0.CreatePatched<IClock>()
    .On(x => x.Now).Do(DateTime.UnixEpoch)
    .On(x => x.GetZone()).Do(() => "UTC")
    .On(x => x.Reset()).Do(() => throw new InvalidOperationException("boom"))
    .On(x => x.NextTick()).DoSequence(s => s.Do(1).Do(2).Do(() => throw new TimeoutException()));

var clock = stub.Result;
```

Static members use the same shape without the instance parameter:

```csharp
using var scope = Stub0.CreatePatchingScope<SystemClock>()
    .On(() => SystemClock.UtcNow).Do(DateTime.UnixEpoch);
```

```csharp
using var scope = Stub0.CreatePatchingScope<DateTime>()
    .On(() => DateTime.Now)
    .Do(new DateTime(2024, 1, 1));
```

```csharp
using var scope = Stub0.CreatePatchingScope(typeof(Console))
    .On(() => Console.WriteLine(Arg.Any<string>()))
    .Do((string value) => { });
```

- `On(...)` accepts instance expressions, static expressions, and regular method/property-getter call shapes.
- `OnSetter(...)`, `OnIndexer(...)`, `OnEventAdd(...)`, and `OnEventRemove(...)` cover the special member shapes that C# expression trees cannot write directly.
- `On(string)` targets the resolved non-generic overload group by member name.
- `IOnBuilder<,>` supports `Do(...)`, `DoSequence(...)`, and `Wrap(...)`.
- `Do(value)` configures a fixed result/value. `Do(...)` with a delegate can compute a result, perform side effects, or throw.
- `Wrap(...)` is the detour-backed around-call primitive. Interface-only and other proxy-only mocks do not support it.
- `ISequenceBuilder` chains `Do(...)`. Use `Do()` for `void` members.

## Quick By-Name Setup

```csharp
using var scope = Stub0.CreatePatchingScope(service)
    .On(nameof(Service.GetName)).Do((CallContext ctx) => $"{ctx.Member.Name}:{ctx.Arguments[0]}")
    .On(nameof(Service.Delete)).Do(() => throw new InvalidOperationException("blocked"));
```

- `On(string).Do(value)`: constant result/value for every matching non-generic overload.
- `On(string).Do((CallContext ctx) => ...)`: compute a result/value from `CallContext`.
- `On(string).Do(() => throw ...)`: by-name exception setup.
- `Preserve(...)`: remove stubbed behavior and call through instead.
- If one overload group needs different behavior, prefer expression-based `On(...)` over `On(string)`.

`CallContext` exposes:

- `Member`
- `Instance`
- `Arguments`

## Wrap And Proceed

```csharp
using var scope = Stub0.CreatePatchingScope(worker)
    .On(w => w.Compute(Arg.Any<int>()))
    .Wrap(ctx =>
    {
        ctx.Arg(0, ctx.Arg<int>(0) + 10);
        return ctx.Proceed<int>() + 1;
    });
```

```csharp
using var scope = Stub0.CreatePatchingScope(client)
    .On(c => c.LoadAsync())
    .Wrap(async ctx =>
    {
        var value = await ctx.ProceedAsync<string>();
        return value.Trim();
    });
```

- Void-returning members can use `Wrap(Action<WrapContext>)` and call `ctx.Proceed();` without returning `null`.
- `WrapContext.Arguments`: stable inbound snapshot inherited from `CallContext`.
- `WrapContext.Arg(index)` / `Arg<T>(index)`: read the live argument values.
- `WrapContext.Arg(index, value)` / `Arg<T>(index, value)`: write the live argument values used by `Proceed()`.
- `WrapContext.Proceed()` / `Proceed<T>()`: call the original implementation once.
- `WrapContext.ProceedAsync()` / `ProceedAsync<T>()`: await `Task` / `Task<T>` originals.
- For synchronous wrappers on `void` members, return `null`.

## Matching And Special Member Shapes

```csharp
using var stub = Stub0.CreatePatched<Worker>()
    .On(x => x.Load(Arg.Is<string>(s => s.StartsWith("user-")))).Do(true)
    .OnSetter((Worker x) => x.Count, () => Arg.Any<int>()).Do((int value) => seen = value);
```

```csharp
int Compute(ref int a, out int b)
{
    a = 10;
    b = 20;
    return 123;
}

using var refStub = Stub0.CreatePatched<IRefWorker>()
    .On(x => x.Compute(ref Arg.Ref(1).Value, out Arg.Out<int>().Value))
    .Do(Compute);
```

- `Arg.Any<T>()`: wildcard match.
- `Arg.Equal(value)`: exact match.
- `Arg.Is<T>(predicate)`: predicate match.
- `Arg.Ref<T>(value).Value` and `Arg.Out<T>().Value`: use inside `ref` and `out` setup or verification expressions.
- `OnSetter(...)` / `VerifySetter(...)` / `SetterInvocations(...)`: property setters.
- `OnIndexer(...)` / `VerifyIndexer(...)` / `IndexerInvocations(...)`: indexer setters.
- `OnEventAdd(...)` / `VerifyEventAdd(...)` / `EventAddInvocations(...)`: event `add` accessors.
- `OnEventRemove(...)` / `VerifyEventRemove(...)` / `EventRemoveInvocations(...)`: event `remove` accessors.

`RefBox<T>` and `OutBox<T>` are the container types behind `Arg.Ref(...)` and `Arg.Out(...)`.

## Verify And Inspect

```csharp
stub.Verify(x => x.Load("user-1"), Times.Once);
stub.VerifySetter(x => x.Count, () => 5, Times.Once);
stub.VerifyOrder(x => x.Open(), x => x.Close());
stub.VerifyNoOtherCalls(x => x.Open(), x => x.Close());

var all = stub.Invocations();
var setters = stub.SetterInvocations(x => x.Count, () => 5);
stub.ClearInvocations();
```

- `Verify(...)`: check call counts for regular expressions or overload groups by name.
- `VerifySetter(...)`, `VerifyIndexer(...)`, `VerifyEventAdd(...)`, `VerifyEventRemove(...)`: check the special member shapes.
- `VerifyOrder(...)`: calls must appear in the supplied order.
- `VerifyNoOtherCalls(...)`: fail if any unlisted calls happened.
- `VerifyNoOtherSetterCalls(...)`, `VerifyNoOtherIndexerCalls(...)`, `VerifyNoOtherEventAddCalls(...)`, `VerifyNoOtherEventRemoveCalls(...)`: the special-member equivalents.
- `Invocations()`: full invocation log.
- `SetterInvocations(...)`, `IndexerInvocations(...)`, `EventAddInvocations(...)`, `EventRemoveInvocations(...)`: filter the log for the special member shapes.
- `ClearInvocations()`: clear the current log without changing setups.

`InvocationRecord` exposes:

- `Sequence`
- `Member`
- `Arguments`
- `IsStatic`

`Times` provides:

- `Never`
- `Once`
- `AtLeastOnce`
- `AtMostOnce`
- `Exactly(count)`
- `AtMost(count)`
- `AtLeast(count)`
- `Between(min, max, inclusive: true)`

## Events And Constructors

```csharp
using var stub = Stub0.CreatePatched<Notifier>();
var notifier = stub.Result;

notifier.Changed += handler;
stub.Raise(nameof(Notifier.Changed), notifier, EventArgs.Empty);
```

```csharp
using var ctorScope = Stub0.CreatePatchingScope<Widget>()
    .BeforeNew(ctx => Console.WriteLine(ctx.Constructor))
    .AfterNew(ctx => Console.WriteLine(ctx.Instance))
    .New(ctx => Console.WriteLine(ctx.Arguments.Count));
```

- `Raise(string eventName, params object?[] args)`: invoke the currently subscribed handlers.
- `BeforeNew(...)`: run before the original constructor on class-based type scopes.
- `AfterNew(...)`: run after the original constructor if it completed on class-based type scopes.
- `New(...)`: replace the original constructor body on class-based type scopes.
- A `New(...)` replacement wins over `BeforeNew(...)` and `AfterNew(...)` in the same scope.

`ConstructorContext` exposes:

- `Constructor`
- `Instance`
- `Arguments`

## Type Map

- `Stub0`: package entry point and scope factory. Includes `ResetDetoursForTesting()` for advanced cleanup scenarios.
- `Stub0<T>`: fluent setup, verification, inspection, event, and constructor-hook API.
- `Stub0TypeScope`: fluent setup, verification, inspection, event, and constructor-hook API for `CreatePatchingScope(Type)`.
- `IOnBuilder<,>`: returned from `On(...)`.
- `ISequenceBuilder`: passed into `DoSequence(...)`.
- `Arg`: argument matching helpers.
- `Times`: verification count helpers.
- `CallContext`: by-name setup context.
- `WrapContext`: live-argument wrap context for detour-backed setups.
- `ConstructorContext`: constructor-hook context.
- `InvocationRecord`: invocation snapshot entry.
- `RefBox<T>` and `OutBox<T>`: helper containers for `ref` and `out` expressions.


## docs/tutorial.md

# Tutorial

This guide starts with the lightest `stub0` workflow and builds up to runtime patching features.

The examples below assume `using stub0;` and a test framework with `Assert`.

## Before you start

Install the package in your test project:

```xml
<ItemGroup>
  <PackageReference Include="stub0" Version="x.y.z" />
</ItemGroup>
```

For supported test frameworks (`xUnit 2`, `xUnit 3`, `NUnit`, `MSTest`, `TUnit`), `stub0` applies its runtime-patching settings automatically.

Choose the lightest API that fits your test:

- `Stub0.CreatePatched<IMyInterface>()`: isolated interface mock, no runtime patching required
- `Stub0.CreatePatched<MyClass>()`: isolated patched object for a class or abstract class
- `Stub0.CreatePatchingScope(instance)`: temporary override for one existing object
- `Stub0.CreatePatchingScope<MyType>()`: open a scope on the owning type; classes and value types are supported
- `Stub0.CreatePatchingScope(typeof(MyStaticClass))`: open a scope on a static class

Interface-only mocks do not need runtime patching. Concrete classes, existing instances, static scopes, and constructor hooks do.

## 1. Start with an interface mock

If `WelcomeService` depends on `IGreetingClient`, start with an isolated interface mock:

```csharp
using var stub = Stub0.CreatePatched<IGreetingClient>()
    .On(c => c.GetGreeting("Ada")).Do("Hello Ada");

var sut = new WelcomeService(stub.Result);

Assert.Equal("HELLO ADA", sut.Welcome("Ada"));
stub.Verify(c => c.GetGreeting("Ada"), Times.Once);
```

This is the simplest `stub0` workflow:

- `CreatePatched<T>()` creates an isolated test double
- `On(...)` selects a member
- `Do(...)` provides the result or behavior
- `Result` is the object you pass into the system under test
- `Verify(...)` checks how many times the call happened

## 2. Match arguments and compute results

Use matchers when the exact argument is not known up front:

- `Arg.Any<T>()`: any value of that type
- `Arg.Equal(value)`: one exact value
- `Arg.Is<T>(predicate)`: custom matching logic

`Do(...)` is useful when the return value depends on the call arguments:

```csharp
using var stub = Stub0.CreatePatched<IDiscounts>()
    .On(d => d.Apply(Arg.Is<string>(code => code.StartsWith("VIP")), Arg.Any<decimal>()))
    .Do((string code, decimal subtotal) => subtotal * 0.8m);

Assert.Equal(80m, stub.Result.Apply("VIP-42", 100m));
stub.Verify(d => d.Apply(Arg.Is<string>(code => code.StartsWith("VIP")), 100m), Times.Once);
```

Use `Do(value)` when the result is fixed. Use `Do(...)` with a delegate when the behavior needs the input arguments.

## 3. Patch one real object for one scope

When your system already owns a real object, patch that exact instance instead of replacing the whole dependency:

```csharp
var client = new ExchangeRateClient();
var otherClient = new ExchangeRateClient();

using (var scope = Stub0.CreatePatchingScope(client)
           .On(c => c.GetRate("USD")).Do(1.25m))
{
    Assert.Equal(1.25m, client.GetRate("USD"));
    Assert.Equal(1.0m, otherClient.GetRate("USD"));
    scope.Verify(c => c.GetRate("USD"), Times.Once);
}

Assert.Equal(1.0m, client.GetRate("USD"));
```

`CreatePatchingScope(instance)` affects only the instance you passed in, and the original behavior returns when the scope is disposed.

## 4. Patch static members with a type scope

For static members, open a scope on the owning type. Classes and value types are supported:

```csharp
var frozen = new DateTime(2030, 1, 1, 0, 0, 0, DateTimeKind.Utc);

using (var scope = Stub0.CreatePatchingScope<AppClock>()
           .On(() => AppClock.UtcNow()).Do(frozen))
{
    Assert.Equal(frozen, AppClock.UtcNow());
    scope.Verify(() => AppClock.UtcNow(), Times.Once);
}
```

This is the usual pattern for time providers, environment helpers, static gateways, and other hard-to-inject static code.

Value types use the same API:

```csharp
using var scope = Stub0.CreatePatchingScope<DateTime>()
    .On(() => DateTime.Now)
    .Do(new DateTime(2024, 1, 1));
```

Static classes use the `Type` overload:

```csharp
using var scope = Stub0.CreatePatchingScope(typeof(Console))
    .On(() => Console.WriteLine(Arg.Any<string>()))
    .Do((string value) => { });
```

## 5. Intercept setters and raise events

Setters, indexers, and event accessors use explicit helper methods when you need to capture or verify them:

```csharp
var captured = 0;

using var stub = Stub0.CreatePatched<RetryOptions>()
    .OnSetter(o => o.MaxRetries, () => Arg.Any<int>())
    .Do((int value) => captured = value);

stub.Result.MaxRetries = 3;

Assert.Equal(3, captured);
stub.VerifySetter(o => o.MaxRetries, () => 3, Times.Once);
```

Static scopes use the same shape, and dedicated helpers also exist for indexers and event accessors:

```csharp
using var scope = Stub0.CreatePatchingScope<SystemClockSettings>()
    .OnSetter(() => SystemClockSettings.MaxRetries, () => Arg.Any<int>())
    .Do((int value) => captured = value);

using var notifier = Stub0.CreatePatched<Notifier>()
    .OnEventAdd(nameof(Notifier.Changed), () => Arg.Any<EventHandler>())
    .Do((EventHandler next) => seen = next);
```

You can also raise events from a mock:

```csharp
using var stub = Stub0.CreatePatched<IDownload>();
var download = stub.Result;
var raised = 0;

download.Completed += (_, _) => raised++;

stub.Raise(nameof(IDownload.Completed), download, EventArgs.Empty);

Assert.Equal(1, raised);
```

`Raise(...)` must receive the same arguments that the event handler expects.

## 6. Throw exceptions or run a sequence

If every matching call should fail, use `Do(() => throw ...)`. If behavior should change across calls, use `DoSequence(...)`:

```csharp
using var stub = Stub0.CreatePatched<IRemoteApi>()
    .On(api => api.Load()).DoSequence(seq => seq.Do(() => throw new TimeoutException("Temporary failure")).Do("ok"));

Assert.Throws<TimeoutException>(() => stub.Result.Load());
Assert.Equal("ok", stub.Result.Load());
Assert.Equal("ok", stub.Result.Load());
```

The last step in a sequence repeats. In the example above, every call after the second one returns `"ok"`.

## 7. Tighten verification when the interaction matters

Once the main behavior works, you can make the test stricter:

```csharp
using var stub = Stub0.CreatePatched<IWorkflow>()
    .On(w => w.Start()).Do(() => { })
    .On(w => w.Finish()).Do(() => { });

var workflow = stub.Result;

workflow.Start();
workflow.Finish();

stub.VerifyOrder(w => w.Start(), w => w.Finish());
stub.VerifyNoOtherCalls(w => w.Start(), w => w.Finish());

var invocations = stub.Invocations();
Assert.Equal(2, invocations.Length);
Assert.Equal(nameof(IWorkflow.Start), invocations[0].Member.Name);

stub.ClearInvocations();
Assert.Empty(stub.Invocations());
```

Useful tools here:

- `Times.Once`, `Times.Never`, `Times.AtLeastOnce`, `Times.AtMostOnce`
- `Times.Exactly(n)`, `Times.AtLeast(n)`, `Times.AtMost(n)`, `Times.Between(min, max)`
- `VerifyOrder(...)` when call order matters
- `VerifyNoOtherCalls(...)` when the listed calls should be the full interaction
- `Invocations()` and `ClearInvocations()` when you want to inspect or reset the recorded log

## 8. Advanced: use `CallContext` for name-based setup

`On(...)` is the best default because it targets one exact member shape. Use `On(string).Do((CallContext ctx) => ...)` when you intentionally want a name-based rule and need access to the runtime arguments:

```csharp
var client = new ExchangeRateClient();

using var scope = Stub0.CreatePatchingScope(client)
    .On(nameof(ExchangeRateClient.GetRate)).Do((CallContext ctx) =>
    {
        var currency = (string)ctx.Arguments[0]!;
        return currency == "USD" ? 1.25m : 0.9m;
    });

Assert.Equal(1.25m, client.GetRate("USD"));
Assert.Equal(0.9m, client.GetRate("EUR"));
```

Use this carefully: name-based setup applies to the resolved non-generic overload group. If you only want one exact overload, prefer `On(...)`.

## 9. Advanced: wrap detour-backed calls around the original implementation

Use `Wrap(...)` when you want one callback that can inspect the inbound snapshot, change the live arguments, and decide whether to call the original implementation:

```csharp
var worker = new Worker();

using var scope = Stub0.CreatePatchingScope(worker)
    .On(w => w.Compute(Arg.Any<int>()))
    .Wrap(ctx =>
    {
        ctx.Arg(0, ctx.Arg<int>(0) + 10);

        var result = ctx.Proceed<int>();
        return result + 1;
    });
```

Task-returning members also support async wrappers:

```csharp
var client = new ApiClient();

using var scope = Stub0.CreatePatchingScope(client)
    .On(c => c.LoadAsync())
    .Wrap(async ctx =>
    {
        var value = await ctx.ProceedAsync<string>();
        return value.Trim();
    });
```

Void-returning members can use the synchronous `Action<WrapContext>` overload:

```csharp
using var scope = Stub0.CreatePatchingScope(worker)
    .On(w => w.Notify(Arg.Any<string>()))
    .Wrap(ctx =>
    {
        ctx.Proceed();
    });
```

`CallContext.Arguments` stays as the original inbound snapshot. `WrapContext.Arg(...)` reads and writes the live arguments that `Proceed()` and `ProceedAsync()` use. `Wrap(...)` is available only on detour-backed setups; interface-only and other proxy-only mocks do not support it.

## 10. Advanced: observe or replace constructors

Constructor hooks are available only for class-based type scopes created via `CreatePatchingScope<T>()`:

- `BeforeNew(...)`: runs before the original constructor
- `AfterNew(...)`: runs after the original constructor
- `New(...)`: replaces the original constructor

If `ReportFactory` creates `Report(int version)`, you can observe constructor calls like this:

```csharp
var seenArgument = -1;
var seenValue = -1;

using (Stub0.CreatePatchingScope<Report>()
       .AfterNew(ctx =>
       {
           seenArgument = (int)ctx.Arguments[0]!;
           seenValue = ((Report)ctx.Instance!).Version;
       }))
{
    _ = new ReportFactory().Create(5);
}

Assert.Equal(5, seenArgument);
Assert.Equal(5, seenValue);
```

To replace the constructor completely:

```csharp
using (Stub0.CreatePatchingScope<Report>().New(ctx => { }))
{
    var report = new ReportFactory().Create(5);
    Assert.Equal(0, report.Version);
}
```

`New(...)` is the most invasive option. Use it sparingly, because the original constructor body does not run.

## Rules of thumb

- Start with interface mocks when you can
- Prefer `On(...)` over name-based setup unless you really want overload-group behavior
- Use `CreatePatchingScope(instance)` when the real instance is already in play
- Use `CreatePatchingScope<T>()` for static members and constructors
- Use `CreatePatchingScope(typeof(MyStaticClass))` for static classes
- Keep scopes inside `using` blocks so the original behavior is restored reliably
- Add `VerifyNoOtherCalls(...)` only when you want the test to lock down the full interaction surface
- If you want patched class instances to fail fast when runtime safety validation is lost, use `Stub0.CreatePatched<T>(true)`

