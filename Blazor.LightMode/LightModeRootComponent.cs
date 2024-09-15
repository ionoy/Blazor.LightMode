namespace Blazor.LightMode;

public struct LightModeRootComponent
{
    private readonly LightModeRenderer? _renderer;
    private readonly int _componentId;

    internal LightModeRootComponent(LightModeRenderer renderer, int componentId, Task quiescenceTask)
    {
        _renderer = renderer;
        _componentId = componentId;
        QuiescenceTask = quiescenceTask;
    }

    public Task QuiescenceTask { get; }

    public string ToHtmlString()
    {
        if (_renderer is null)
        {
            return string.Empty;
        }

        using var writer = new StringWriter();
        WriteHtmlTo(writer);
        
        return writer.ToString();
    }

    public void WriteHtmlTo(TextWriter output)
    {
        _renderer?.WriteComponentHtml(_componentId, output);
    }
}