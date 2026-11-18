package com.manageedocs.retention.model;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.TenantId;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "legal_hold_document")
public class LegalHoldDocument {

    @Embeddable
    public static class Key implements Serializable {
        @Column(name = "legal_hold_id")
        private UUID legalHoldId;

        @Column(name = "document_id")
        private UUID documentId;

        protected Key() {
        }

        public Key(UUID legalHoldId, UUID documentId) {
            this.legalHoldId = legalHoldId;
            this.documentId = documentId;
        }

        public UUID legalHoldId() { return legalHoldId; }
        public UUID documentId() { return documentId; }

        @Override
        public boolean equals(Object o) {
            return o instanceof Key k && Objects.equals(legalHoldId, k.legalHoldId) && Objects.equals(documentId, k.documentId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(legalHoldId, documentId);
        }
    }

    @EmbeddedId
    private Key id;

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "added_by", nullable = false)
    private UUID addedBy;

    @Column(name = "added_at", nullable = false)
    private Instant addedAt;

    protected LegalHoldDocument() {
    }

    public LegalHoldDocument(UUID legalHoldId, UUID documentId, UUID addedBy, Instant addedAt) {
        this.id = new Key(legalHoldId, documentId);
        this.addedBy = addedBy;
        this.addedAt = addedAt;
    }

    public Key getId() { return id; }
    public UUID getAddedBy() { return addedBy; }
    public Instant getAddedAt() { return addedAt; }
}
