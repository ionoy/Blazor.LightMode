using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Components;

namespace Blazor.LightMode.DotNetInternals;

internal sealed class ElementReferenceJsonConverter(ElementReferenceContext elementReferenceContext) : JsonConverter<ElementReference>
{
    private static readonly JsonEncodedText IdProperty = JsonEncodedText.Encode("__internalId");

    public override ElementReference Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        string? id = null;
        while (reader.Read() && reader.TokenType != JsonTokenType.EndObject)
        {
            if (reader.TokenType == JsonTokenType.PropertyName)
            {
                if (reader.ValueTextEquals(IdProperty.EncodedUtf8Bytes))
                {
                    reader.Read();
                    id = reader.GetString();
                }
                else
                {
                    throw new JsonException($"Unexpected JSON property '{reader.GetString()}'.");
                }
            }
            else
            {
                throw new JsonException($"Unexpected JSON Token {reader.TokenType}.");
            }
        }

        if (id is null)
        {
            throw new JsonException("__internalId is required.");
        }

        return new ElementReference(id, elementReferenceContext);
    }

    public override void Write(Utf8JsonWriter writer, ElementReference value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        writer.WriteString(IdProperty, value.Id);
        writer.WriteEndObject();
    }
}
