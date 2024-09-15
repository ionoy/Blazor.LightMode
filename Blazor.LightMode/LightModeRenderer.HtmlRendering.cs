using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Forms;
using Microsoft.AspNetCore.Components.RenderTree;

namespace Blazor.LightMode;

#pragma warning disable BL0006
public partial class LightModeRenderer
{
    private static readonly HashSet<string> SelfClosingElements = new(StringComparer.OrdinalIgnoreCase)
    {
        "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"
    };

    private readonly TextEncoder _javaScriptEncoder;
    private TextEncoder _htmlEncoder;
    private string? _closestSelectValueAsString;

    /// <summary>
    /// Renders the specified component as HTML to the output.
    /// </summary>
    /// <param name="componentId">The ID of the component whose current HTML state is to be rendered.</param>
    /// <param name="output">The output destination.</param>
    protected internal virtual void WriteComponentHtml(int componentId, TextWriter output)
    {
        // We're about to walk over some buffers inside the renderer that can be mutated during rendering.
        // So, we require exclusive access to the renderer during this synchronous process.
        Dispatcher.AssertAccess();

        var frames = GetCurrentRenderTreeFrames(componentId);
        RenderFrames(componentId, output, frames, 0, frames.Count);
    }

    /// <summary>
    /// Renders the specified component frame as HTML to the output.
    /// </summary>
    /// <param name="output">The output destination.</param>
    /// <param name="componentFrame">The <see cref="RenderTreeFrame"/> representing the component to be rendered.</param>
    protected virtual void RenderChildComponent(TextWriter output, ref RenderTreeFrame componentFrame)
    {
        WriteComponentHtml(componentFrame.ComponentId, output);
    }

    private int RenderFrames(int componentId, TextWriter output, ArrayRange<RenderTreeFrame> frames, int position, int maxElements)
    {
        var nextPosition = position;
        var endPosition = position + maxElements;
        while (position < endPosition)
        {
            nextPosition = RenderCore(componentId, output, frames, position);
            if (position == nextPosition)
            {
                throw new InvalidOperationException("We didn't consume any input.");
            }
            position = nextPosition;
        }

        return nextPosition;
    }

    private int RenderCore(
        int componentId,
        TextWriter output,
        ArrayRange<RenderTreeFrame> frames,
        int position)
    {
        ref var frame = ref frames.Array[position];
        switch (frame.FrameType)
        {
            case RenderTreeFrameType.Element:
                return RenderElement(componentId, output, frames, position);
            case RenderTreeFrameType.Attribute:
                throw new InvalidOperationException($"Attributes should only be encountered within {nameof(RenderElement)}");
            case RenderTreeFrameType.Text:
                _htmlEncoder.Encode(output, frame.TextContent);
                return ++position;
            case RenderTreeFrameType.Markup:
                output.Write(frame.MarkupContent);
                return ++position;
            case RenderTreeFrameType.Component:
                return RenderChildComponent(output, frames, position);
            case RenderTreeFrameType.Region:
                return RenderFrames(componentId, output, frames, position + 1, frame.RegionSubtreeLength - 1);
            case RenderTreeFrameType.ElementReferenceCapture:
            case RenderTreeFrameType.ComponentReferenceCapture:
                return ++position;
            case RenderTreeFrameType.NamedEvent:
                
                return ++position;
            default:
                throw new InvalidOperationException($"Invalid element frame type '{frame.FrameType}'.");
        }
    }

    private int RenderElement(int componentId, TextWriter output, ArrayRange<RenderTreeFrame> frames, int position)
    {
        ref var frame = ref frames.Array[position];
        output.Write('<');
        output.Write(frame.ElementName);
        int afterElement;
        var isTextArea = string.Equals(frame.ElementName, "textarea", StringComparison.OrdinalIgnoreCase);
        var isForm = string.Equals(frame.ElementName, "form", StringComparison.OrdinalIgnoreCase);
        // We don't want to include value attribute of textarea element.
        var afterAttributes = RenderAttributes(output, frames, componentId, position + 1, frame.ElementSubtreeLength - 1, !isTextArea, isForm: isForm, out var capturedValueAttribute);

        // When we see an <option> as a descendant of a <select>, and the option's "value" attribute matches the
        // "value" attribute on the <select>, then we auto-add the "selected" attribute to that option. This is
        // a way of converting Blazor's select binding feature to regular static HTML.
        if (_closestSelectValueAsString != null
            && string.Equals(frame.ElementName, "option", StringComparison.OrdinalIgnoreCase)
            && string.Equals(capturedValueAttribute, _closestSelectValueAsString, StringComparison.Ordinal))
        {
            output.Write(" selected");
        }

        var remainingElements = frame.ElementSubtreeLength + position - afterAttributes;
        if (remainingElements > 0 || isTextArea)
        {
            output.Write('>');

            var isSelect = string.Equals(frame.ElementName, "select", StringComparison.OrdinalIgnoreCase);
            if (isSelect)
            {
                _closestSelectValueAsString = capturedValueAttribute;
            }

            if (isTextArea && !string.IsNullOrEmpty(capturedValueAttribute))
            {
                // Textarea is a special type of form field where the value is given as text content instead of a 'value' attribute
                // So, if we captured a value attribute, use that instead of any child content
                _htmlEncoder.Encode(output, capturedValueAttribute);
                afterElement = position + frame.ElementSubtreeLength; // Skip descendants
            }
            else if (string.Equals(frame.ElementName, "script", StringComparison.OrdinalIgnoreCase))
            {
                afterElement = RenderScriptElementChildren(componentId, output, frames, afterAttributes, remainingElements);
            }
            else
            {
                afterElement = RenderChildren(componentId, output, frames, afterAttributes, remainingElements);
            }

            if (isSelect)
            {
                // There's no concept of nested <select> elements, so as soon as we're exiting one of them,
                // we can safely say there is no longer any value for this
                _closestSelectValueAsString = null;
            }

            if (frame.ElementName == "html")
            {
                InsertInitialBatchScript(output);
            }

            output.Write("</");
            output.Write(frame.ElementName);
            output.Write('>');
            Debug.Assert(afterElement == position + frame.ElementSubtreeLength);
            return afterElement;
        }
        else
        {
            if (SelfClosingElements.Contains(frame.ElementName))
            {
                output.Write(" />");
            }
            else
            {
                output.Write("></");
                output.Write(frame.ElementName);
                output.Write('>');
            }
            Debug.Assert(afterAttributes == position + frame.ElementSubtreeLength);
            return afterAttributes;
        }
    }
    private void InsertInitialBatchScript(TextWriter output)
    {
        if (_renderBatchQueue.TryDequeue(out var renderBatch))
        {
            output.Write("<script id='blazor-initialization' type='application/json'>");
            output.Write(renderBatch.SerializeToBase64());
            output.Write("</script>");
        }
    }

    private int RenderScriptElementChildren(int componentId, TextWriter output, ArrayRange<RenderTreeFrame> frames, int position, int maxElements)
    {
        // Inside a <script> context, AddContent calls should result in the text being
        // JavaScript encoded rather than HTML encoded. It's not that we recommend inserting
        // user-supplied content inside a <script> block, but that if someone does, we
        // want the encoding style to match the context for correctness and safety. This is
        // also consistent with .cshtml's treatment of <script>.
        var originalEncoder = _htmlEncoder;
        try
        {
            _htmlEncoder = _javaScriptEncoder;
            return RenderChildren(componentId, output, frames, position, maxElements);
        }
        finally
        {
            _htmlEncoder = originalEncoder;
        }
    }
    
    private int RenderAttributes(
        TextWriter output,
        ArrayRange<RenderTreeFrame> frames,
        int componentId,
        int position,
        int maxElements,
        bool includeValueAttribute,
        bool isForm,
        out string? capturedValueAttribute)
    {
        capturedValueAttribute = null;
        
        output.Write($" __bl_id=\"{componentId}\"");
        
        for (var i = 0; i < maxElements; i++)
        {
            var candidateIndex = position + i;
            ref var frame = ref frames.Array[candidateIndex];

            if (frame.FrameType != RenderTreeFrameType.Attribute)
            {
                if (frame.FrameType == RenderTreeFrameType.ElementReferenceCapture)
                    continue;

                return candidateIndex;
            }

            if (frame.AttributeName.Equals("value", StringComparison.OrdinalIgnoreCase))
            {
                capturedValueAttribute = frame.AttributeValue as string;

                if (!includeValueAttribute)
                {
                    continue;
                }
            }
            
            switch (frame.AttributeValue)
            {
                case bool flag when flag:
                    output.Write(' ');
                    output.Write(frame.AttributeName);
                    break;
                case string value:
                    output.Write(' ');
                    output.Write(frame.AttributeName);
                    output.Write('=');
                    output.Write('\"');
                    _htmlEncoder.Encode(output, value);
                    output.Write('\"');
                    break;
                case Delegate @delegate:
                    output.Write(' ');
                    output.Write("__bl_" +frame.AttributeName);
                    output.Write('=');
                    output.Write('\"');
                    var delegateKey = frame.AttributeEventHandlerId.ToString();
                    _htmlEncoder.Encode(output, delegateKey);
                    output.Write('\"');
                    break;
            }
        }

        return position + maxElements;
    }
    
    private int RenderChildren(int componentId, TextWriter output, ArrayRange<RenderTreeFrame> frames, int position, int maxElements)
    {
        if (maxElements == 0)
        {
            return position;
        }

        return RenderFrames(componentId, output, frames, position, maxElements);
    }

    private int RenderChildComponent(TextWriter output, ArrayRange<RenderTreeFrame> frames, int position)
    {
        ref var frame = ref frames.Array[position];

        RenderChildComponent(output, ref frame);

        return position + frame.ComponentSubtreeLength;
    }
}

#pragma warning restore BL0006