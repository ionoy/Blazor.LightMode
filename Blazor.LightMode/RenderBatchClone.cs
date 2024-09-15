using System.Diagnostics.CodeAnalysis;
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