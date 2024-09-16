using System.Diagnostics.CodeAnalysis;
using System.Text;
using Microsoft.AspNetCore.Components.RenderTree;

namespace Blazor.LightMode;

[SuppressMessage("Usage", "BL0006:Do not use RenderTree types")]
public class RenderBatchClone
{
    /// <summary>
    /// Gets the changes to components that were added or updated.
    /// </summary>
    public ArrayRange<RenderTreeDiffClone> UpdatedComponents { get; }

    /// <summary>
    /// Gets render frames that may be referenced by entries in <see cref="UpdatedComponents"/>.
    /// For example, edit entries of type <see cref="RenderTreeEditType.PrependFrame"/>
    /// will point to an entry in this array to specify the subtree to be prepended.
    /// </summary>
    public ArrayRange<RenderTreeFrame> ReferenceFrames { get; }

    /// <summary>
    /// Gets the IDs of the components that were disposed.
    /// </summary>
    public ArrayRange<int> DisposedComponentIDs { get; }

    /// <summary>
    /// Gets the IDs of the event handlers that were disposed.
    /// </summary>
    public ArrayRange<ulong> DisposedEventHandlerIDs { get; }

    /// <summary>
    /// Gets the named events that were changed, or null.
    /// </summary>
    public ArrayRange<NamedEventChange>? NamedEventChanges { get; }
    
    
    public RenderBatchClone(in RenderBatch renderBatch)
    {
        var renderTreeDiffClones = new RenderTreeDiffClone[renderBatch.UpdatedComponents.Count];
        var updatedComponents = renderBatch.UpdatedComponents.Array;
        for (var i = 0; i < renderBatch.UpdatedComponents.Count; i++)
        {
            var updatedComponent = updatedComponents[i];
            renderTreeDiffClones[i] = new RenderTreeDiffClone(updatedComponent.ComponentId, updatedComponent.Edits);
        }
        
        UpdatedComponents = new ArrayRange<RenderTreeDiffClone>(renderTreeDiffClones, renderBatch.UpdatedComponents.Count);
        ReferenceFrames = renderBatch.ReferenceFrames.Clone();
        DisposedComponentIDs = renderBatch.DisposedComponentIDs.Clone();
        DisposedEventHandlerIDs = renderBatch.DisposedEventHandlerIDs.Clone();
        NamedEventChanges = renderBatch.NamedEventChanges?.Clone();
    }
    
    public string SerializeToBase64()
    {
        using var memoryStream = new MemoryStream();
        using var renderBatchWriter = new RenderBatchCloneWriter(memoryStream, false);
        renderBatchWriter.Write(this);
        return Convert.ToBase64String(memoryStream.ToArray());
    }
}

[SuppressMessage("Usage", "BL0006:Do not use RenderTree types")]
public struct RenderTreeDiffClone
{
    public int ComponentId { get; }
    public ArrayRange<RenderTreeEdit> Edits { get; }

    public RenderTreeDiffClone(int componentId, ArrayBuilderSegment<RenderTreeEdit> edits)
    {
        ComponentId = componentId;
        var newArray = new RenderTreeEdit[edits.Count];
        Array.Copy(edits.Array, edits.Offset, newArray, 0, edits.Count);
        Edits = new ArrayRange<RenderTreeEdit>(newArray, newArray.Length);
    }
}

[SuppressMessage("Usage", "BL0006:Do not use RenderTree types")]
internal sealed class RenderBatchWriter : IDisposable
{
    private readonly List<string> _strings = new();
    private readonly Dictionary<string, int> _deduplicatedStringIndices = new();
    private readonly BinaryWriter _binaryWriter;

    public RenderBatchWriter(Stream output, bool leaveOpen)
    {
        _binaryWriter = new BinaryWriter(output, Encoding.UTF8, leaveOpen);
    }

    public void Write(in RenderBatch renderBatch)
    {
        var updatedComponentsOffset = Write(renderBatch.UpdatedComponents);
        var referenceFramesOffset = Write(renderBatch.ReferenceFrames);
        var disposedComponentIdsOffset = Write(renderBatch.DisposedComponentIDs);
        var disposedEventHandlerIdsOffset = Write(renderBatch.DisposedEventHandlerIDs);
        var stringTableOffset = WriteStringTable();

        _binaryWriter.Write(updatedComponentsOffset);
        _binaryWriter.Write(referenceFramesOffset);
        _binaryWriter.Write(disposedComponentIdsOffset);
        _binaryWriter.Write(disposedEventHandlerIdsOffset);
        _binaryWriter.Write(stringTableOffset);
    }

    int Write(in ArrayRange<RenderTreeDiff> diffs)
    {
        var count = diffs.Count;
        var diffsIndexes = new int[count];
        var array = diffs.Array;
        var baseStream = _binaryWriter.BaseStream;
        for (var i = 0; i < count; i++)
        {
            diffsIndexes[i] = (int)baseStream.Position;
            Write(array[i]);
        }

        // Now write out the table of locations
        var tableStartPos = (int)baseStream.Position;
        _binaryWriter.Write(count);
        for (var i = 0; i < count; i++)
        {
            _binaryWriter.Write(diffsIndexes[i]);
        }

        return tableStartPos;
    }

    void Write(in RenderTreeDiff diff)
    {
        _binaryWriter.Write(diff.ComponentId);

        var edits = diff.Edits;
        _binaryWriter.Write(edits.Count);

        var editsArray = edits.Array;
        var editsEndIndexExcl = edits.Offset + edits.Count;
        for (var i = edits.Offset; i < editsEndIndexExcl; i++)
        {
            Write(editsArray[i]);
        }
    }

    void Write(in RenderTreeEdit edit)
    {
        // We want all RenderTreeEdit outputs to be of the same length, so that
        // the recipient can index into the array directly without walking it.
        // So we output some value for all properties, even when not applicable
        // for this specific RenderTreeEditType.
        _binaryWriter.Write((int)edit.Type);
        _binaryWriter.Write(edit.SiblingIndex);

        // ReferenceFrameIndex and MoveToSiblingIndex share a slot, so this writes
        // whichever one applies to the edit type
        _binaryWriter.Write(edit.ReferenceFrameIndex);

        WriteString(edit.RemovedAttributeName, allowDeduplication: true);
    }

    int Write(in ArrayRange<RenderTreeFrame> frames)
    {
        var startPos = (int)_binaryWriter.BaseStream.Position;

        var array = frames.Array;
        var count = frames.Count;
        _binaryWriter.Write(count);
        for (var i = 0; i < count; i++)
        {
            Write(array[i]);
        }

        return startPos;
    }

    void Write(in RenderTreeFrame frame)
    {
        // TODO: Change this to write as a short, saving 2 bytes per frame
        _binaryWriter.Write((int)frame.FrameType);

        // We want each frame to take up the same number of bytes, so that the
        // recipient can index into the array directly instead of having to
        // walk through it.
        // Since we can fit every frame type into 16 bytes, use that as the
        // common size. For smaller frames, we add padding to expand it to
        // 16 bytes.
        switch (frame.FrameType)
        {
            case RenderTreeFrameType.Attribute:
                WriteString(frame.AttributeName, allowDeduplication: true);
                if (frame.AttributeValue is bool boolValue)
                {
                    // Encoding the bool as either "" or null is pretty odd, but avoids
                    // having to pack any "what type of thing is this" info into the same
                    // 4 bytes as the string table index. If, later, we need a way of
                    // distinguishing whether an attribute value is really a bool or a string
                    // or something else, we'll need a different encoding mechanism. Since there
                    // would never be more than (say) 2^28 (268 million) distinct string table
                    // entries, we could use the first 4 bits to encode the value type.
                    WriteString(boolValue ? string.Empty : null, allowDeduplication: true);
                }
                else
                {
                    var attributeValueString = frame.AttributeValue as string;
                    WriteString(attributeValueString, allowDeduplication: string.IsNullOrEmpty(attributeValueString));
                }
                _binaryWriter.Write(frame.AttributeEventHandlerId); // 8 bytes
                break;
            case RenderTreeFrameType.Component:
                _binaryWriter.Write(frame.ComponentSubtreeLength);
                _binaryWriter.Write(frame.ComponentId);
                WritePadding(_binaryWriter, 8);
                break;
            case RenderTreeFrameType.ComponentReferenceCapture:
            case RenderTreeFrameType.ComponentRenderMode:
            case RenderTreeFrameType.NamedEvent:
                // The client doesn't need to know about these. But we still have
                // to include them in the array otherwise the ReferenceFrameIndex
                // values in the edits data would be wrong.
                WritePadding(_binaryWriter, 16);
                break;
            case RenderTreeFrameType.Element:
                _binaryWriter.Write(frame.ElementSubtreeLength);
                WriteString(frame.ElementName, allowDeduplication: true);
                WritePadding(_binaryWriter, 8);
                break;
            case RenderTreeFrameType.ElementReferenceCapture:
                WriteString(frame.ElementReferenceCaptureId, allowDeduplication: false);
                WritePadding(_binaryWriter, 12);
                break;
            case RenderTreeFrameType.Region:
                _binaryWriter.Write(frame.RegionSubtreeLength);
                WritePadding(_binaryWriter, 12);
                break;
            case RenderTreeFrameType.Text:
                WriteString(
                    frame.TextContent,
                    allowDeduplication: string.IsNullOrWhiteSpace(frame.TextContent));
                WritePadding(_binaryWriter, 12);
                break;
            case RenderTreeFrameType.Markup:
                WriteString(frame.MarkupContent, allowDeduplication: false);
                WritePadding(_binaryWriter, 12);
                break;
            default:
                throw new ArgumentException($"Unsupported frame type: {frame.FrameType}");
        }
    }

    int Write(in ArrayRange<int> numbers)
    {
        var startPos = (int)_binaryWriter.BaseStream.Position;
        _binaryWriter.Write(numbers.Count);

        var array = numbers.Array;
        var count = numbers.Count;
        for (var index = 0; index < count; index++)
        {
            _binaryWriter.Write(array[index]);
        }

        return startPos;
    }

    int Write(in ArrayRange<ulong> numbers)
    {
        var startPos = (int)_binaryWriter.BaseStream.Position;
        _binaryWriter.Write(numbers.Count);

        var array = numbers.Array;
        var count = numbers.Count;
        for (var index = 0; index < count; index++)
        {
            _binaryWriter.Write(array[index]);
        }

        return startPos;
    }

    void WriteString(string value, bool allowDeduplication)
    {
        if (value == null)
        {
            _binaryWriter.Write(-1);
        }
        else
        {
            int stringIndex;

            if (!allowDeduplication || !_deduplicatedStringIndices.TryGetValue(value, out stringIndex))
            {
                stringIndex = _strings.Count;
                _strings.Add(value);

                if (allowDeduplication)
                {
                    _deduplicatedStringIndices.Add(value, stringIndex);
                }
            }

            _binaryWriter.Write(stringIndex);
        }
    }

    int WriteStringTable()
    {
        // Capture the locations of each string
        var stringsCount = _strings.Count;
        var locations = new int[stringsCount];

        for (var i = 0; i < stringsCount; i++)
        {
            var stringValue = _strings[i];
            locations[i] = (int)_binaryWriter.BaseStream.Position;
            _binaryWriter.Write(stringValue);
        }

        // Now write the locations
        var locationsStartPos = (int)_binaryWriter.BaseStream.Position;
        for (var i = 0; i < stringsCount; i++)
        {
            _binaryWriter.Write(locations[i]);
        }

        return locationsStartPos;
    }

    static void WritePadding(BinaryWriter writer, int numBytes)
    {
        while (numBytes >= 4)
        {
            writer.Write(0);
            numBytes -= 4;
        }

        while (numBytes > 0)
        {
            writer.Write((byte)0);
            numBytes--;
        }
    }

    public void Dispose()
    {
        _binaryWriter.Dispose();
    }
}