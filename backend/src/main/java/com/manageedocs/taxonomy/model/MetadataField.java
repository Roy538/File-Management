package com.manageedocs.taxonomy.model;

import com.manageedocs.common.persistence.TenantScopedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

/** One configurable field in a document type's metadata schema. */
@Entity
@Table(name = "metadata_field")
public class MetadataField extends TenantScopedEntity {

    public enum DataType { TEXT, NUMBER, DATE, BOOLEAN, ENUM }

    private static final Pattern KEY = Pattern.compile("[a-z][a-z0-9_]{0,63}");

    @Column(name = "document_type_id", nullable = false)
    private UUID documentTypeId;

    @Column(name = "field_key", nullable = false, length = 64)
    private String key;

    @Column(nullable = false, length = 200)
    private String label;

    @Enumerated(EnumType.STRING)
    @Column(name = "data_type", nullable = false, length = 16)
    private DataType dataType;

    @Column(nullable = false)
    private boolean required;

    @Column(name = "allowed_values", columnDefinition = "text")
    private String allowedValues;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    protected MetadataField() {
    }

    public MetadataField(UUID documentTypeId, String key, String label, DataType dataType, boolean required,
                         List<String> allowedValues, int sortOrder) {
        if (key == null || !KEY.matcher(key).matches()) {
            throw new IllegalArgumentException("Field key must be lower_snake_case, starting with a letter");
        }
        if (dataType == DataType.ENUM && (allowedValues == null || allowedValues.isEmpty())) {
            throw new IllegalArgumentException("ENUM fields need allowed values");
        }
        this.documentTypeId = documentTypeId;
        this.key = key;
        this.label = label.trim();
        this.dataType = dataType;
        this.required = required;
        this.allowedValues = dataType == DataType.ENUM ? String.join("\n", allowedValues.stream().map(String::trim).toList()) : null;
        this.sortOrder = sortOrder;
    }

    public List<String> allowedValueList() {
        return allowedValues == null ? List.of() : Arrays.asList(allowedValues.split("\n"));
    }

    public UUID getDocumentTypeId() { return documentTypeId; }
    public String getKey() { return key; }
    public String getLabel() { return label; }
    public DataType getDataType() { return dataType; }
    public boolean isRequired() { return required; }
    public int getSortOrder() { return sortOrder; }
}
