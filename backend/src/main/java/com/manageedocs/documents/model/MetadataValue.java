package com.manageedocs.documents.model;

import com.manageedocs.common.persistence.Ids;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.TenantId;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/** A typed metadata value; exactly one value column is set, matching the field's data type. */
@Entity
@Table(name = "document_metadata_value")
public class MetadataValue {

    @Id
    private UUID id = Ids.newId();

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "document_id", nullable = false)
    private UUID documentId;

    @Column(name = "field_id", nullable = false)
    private UUID fieldId;

    @Column(name = "value_text", length = 1000)
    private String text;

    @Column(name = "value_number", precision = 20, scale = 6)
    private BigDecimal number;

    @Column(name = "value_date")
    private LocalDate date;

    @Column(name = "value_bool")
    private Boolean bool;

    protected MetadataValue() {
    }

    public MetadataValue(UUID documentId, UUID fieldId) {
        this.documentId = documentId;
        this.fieldId = fieldId;
    }

    public void set(String text, BigDecimal number, LocalDate date, Boolean bool) {
        this.text = text;
        this.number = number;
        this.date = date;
        this.bool = bool;
    }

    /** The stored value rendered as the canonical string used in API responses. */
    public String asString() {
        if (text != null) return text;
        if (number != null) return number.stripTrailingZeros().toPlainString();
        if (date != null) return date.toString();
        if (bool != null) return bool.toString();
        return null;
    }

    public UUID getDocumentId() { return documentId; }
    public UUID getFieldId() { return fieldId; }
}
