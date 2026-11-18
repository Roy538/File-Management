package com.manageedocs.search.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/** Extracted text of one document version, FULLTEXT-indexed by MySQL. Rebuildable by re-indexing. */
@Entity
@Table(name = "document_text")
public class DocumentText {

    @Id
    @Column(name = "document_version_id")
    private UUID documentVersionId;

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "document_id", nullable = false)
    private UUID documentId;

    @Column(nullable = false, columnDefinition = "mediumtext")
    private String content;

    @Column(nullable = false)
    private boolean truncated;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected DocumentText() {
    }

    public DocumentText(UUID documentVersionId, UUID documentId, String content, boolean truncated, Instant now) {
        this.documentVersionId = documentVersionId;
        this.documentId = documentId;
        this.content = content;
        this.truncated = truncated;
        this.createdAt = now;
    }

    public void replace(String newContent, boolean newTruncated, Instant now) {
        this.content = newContent;
        this.truncated = newTruncated;
        this.createdAt = now;
    }

    public UUID getDocumentVersionId() { return documentVersionId; }
    public String getContent() { return content; }
    public boolean isTruncated() { return truncated; }
    public UUID getDocumentId() { return documentId; }
}
