package com.manageedocs.documents.service;

import com.manageedocs.documents.model.MetadataValue;
import com.manageedocs.documents.repository.MetadataValueRepository;
import com.manageedocs.exception.ApiException;
import com.manageedocs.exception.FieldValidationException;
import com.manageedocs.taxonomy.model.DocumentType;
import com.manageedocs.taxonomy.model.MetadataField;
import com.manageedocs.taxonomy.repository.DocumentTypeRepository;
import com.manageedocs.taxonomy.repository.MetadataFieldRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Validates metadata against the document type's schema and stores it as typed values. */
@Service
public class MetadataService {

    private final DocumentTypeRepository types;
    private final MetadataFieldRepository fields;
    private final MetadataValueRepository values;

    public MetadataService(DocumentTypeRepository types, MetadataFieldRepository fields, MetadataValueRepository values) {
        this.types = types;
        this.fields = fields;
        this.values = values;
    }

    /** A value that passed validation, ready to persist. */
    public record Typed(UUID fieldId, String text, BigDecimal number, LocalDate date, Boolean bool) {
    }

    public DocumentType requireActiveType(UUID typeId) {
        return types.findById(typeId).filter(DocumentType::isActive)
                .orElseThrow(() -> ApiException.notFound("Document type"));
    }

    /**
     * Validates every supplied value and every required field. All problems are reported at once,
     * keyed by field key. Without a document type, metadata must be empty.
     */
    public List<Typed> validate(UUID typeId, Map<String, String> raw) {
        Map<String, String> input = raw == null ? Map.of() : raw;
        if (typeId == null) {
            if (!input.isEmpty()) throw new IllegalArgumentException("Metadata requires a document type");
            return List.of();
        }
        requireActiveType(typeId);
        Map<String, MetadataField> schema = new LinkedHashMap<>();
        for (MetadataField f : fields.findByDocumentTypeIdOrderBySortOrderAsc(typeId)) schema.put(f.getKey(), f);

        Map<String, String> errors = new LinkedHashMap<>();
        for (String key : input.keySet()) {
            if (!schema.containsKey(key)) errors.put(key, "is not a field of this document type");
        }
        List<Typed> out = new ArrayList<>();
        for (MetadataField f : schema.values()) {
            String v = input.get(f.getKey());
            if (v == null || v.isBlank()) {
                if (f.isRequired()) errors.put(f.getKey(), f.getLabel() + " is required");
                continue;
            }
            v = v.trim();
            try {
                out.add(switch (f.getDataType()) {
                    case TEXT -> {
                        if (v.length() > 1000) throw new IllegalArgumentException("must be at most 1000 characters");
                        yield new Typed(f.getId(), v, null, null, null);
                    }
                    case NUMBER -> new Typed(f.getId(), null, new BigDecimal(v), null, null);
                    case DATE -> new Typed(f.getId(), null, null, LocalDate.parse(v), null);
                    case BOOLEAN -> {
                        if (!v.equalsIgnoreCase("true") && !v.equalsIgnoreCase("false")) {
                            throw new IllegalArgumentException("must be true or false");
                        }
                        yield new Typed(f.getId(), null, null, null, Boolean.parseBoolean(v));
                    }
                    case ENUM -> {
                        if (!f.allowedValueList().contains(v)) {
                            throw new IllegalArgumentException("must be one of " + f.allowedValueList());
                        }
                        yield new Typed(f.getId(), v, null, null, null);
                    }
                });
            } catch (NumberFormatException e) {
                errors.put(f.getKey(), "must be a number");
            } catch (DateTimeParseException e) {
                errors.put(f.getKey(), "must be a date (YYYY-MM-DD)");
            } catch (IllegalArgumentException e) {
                errors.put(f.getKey(), e.getMessage());
            }
        }
        if (!errors.isEmpty()) throw new FieldValidationException("Some metadata values are invalid", errors);
        return out;
    }

    /** Replaces the document's metadata with {@code typed}. Must run inside the caller's transaction. */
    public void replace(UUID documentId, List<Typed> typed) {
        values.deleteForDocument(documentId);
        for (Typed t : typed) {
            MetadataValue mv = new MetadataValue(documentId, t.fieldId());
            mv.set(t.text(), t.number(), t.date(), t.bool());
            values.save(mv);
        }
    }

    /** {key → label/value} for display, in schema order. */
    public List<Map<String, String>> describe(UUID documentId, UUID typeId) {
        if (typeId == null) return List.of();
        Map<UUID, MetadataValue> byField = new LinkedHashMap<>();
        for (MetadataValue v : values.findByDocumentId(documentId)) byField.put(v.getFieldId(), v);
        List<Map<String, String>> out = new ArrayList<>();
        for (MetadataField f : fields.findByDocumentTypeIdOrderBySortOrderAsc(typeId)) {
            MetadataValue v = byField.get(f.getId());
            Map<String, String> row = new LinkedHashMap<>();
            row.put("key", f.getKey());
            row.put("label", f.getLabel());
            row.put("dataType", f.getDataType().name());
            row.put("value", v == null ? null : v.asString());
            out.add(row);
        }
        return out;
    }
}
