package com.manageedocs.documents.model;

import com.manageedocs.common.persistence.Ids;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/**
 * One immutable revision of a document's content. Never updated or deleted: restoring an old
 * version creates a new one that copies it ({@code restoredFromNo}).
 */
@Entity
@Immutable
@Table(name = "document_version")
public class DocumentVersion {

    /**
     * STORED: binary safely stored, not yet scanned or text-extracted (the Phase 4 pipeline moves
     * it to AVAILABLE / FAILED / QUARANTINED).
     */
    public enum ProcessingStatus { STORED, PROCESSING, AVAILABLE, FAILED, QUARANTINED }

    @Id
    private UUID id = Ids.newId();

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "document_id", nullable = false)
    private UUID documentId;

    @Column(name = "version_no", nullable = false)
    private int versionNo;

    @Column(name = "storage_key", nullable = false, length = 255)
    private String storageKey;

    @Column(name = "original_filename", nullable = false, length = 255)
    private String originalFilename;

    @Column(name = "content_type", nullable = false, length = 127)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(nullable = false, length = 64)
    private String sha256;

    @Enumerated(EnumType.STRING)
    @Column(name = "processing_status", nullable = false, length = 16)
    private ProcessingStatus processingStatus;

    @Column(name = "change_comment", length = 1000)
    private String changeComment;

    @Column(name = "restored_from_no")
    private Integer restoredFromNo;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected DocumentVersion() {
    }

    public DocumentVersion(UUID documentId, int versionNo, String storageKey, String originalFilename,
                           String contentType, long sizeBytes, String sha256, String changeComment,
                           Integer restoredFromNo, UUID createdBy, Instant createdAt) {
        this.documentId = documentId;
        this.versionNo = versionNo;
        this.storageKey = storageKey;
        this.originalFilename = originalFilename;
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
        this.sha256 = sha256;
        this.processingStatus = ProcessingStatus.STORED;
        this.changeComment = changeComment == null || changeComment.isBlank() ? null : changeComment.trim();
        this.restoredFromNo = restoredFromNo;
        this.createdBy = createdBy;
        this.createdAt = createdAt;
    }

    /**
     * Server-generated key: tenant / document / random. Never derived from client input. The version
     * number is not part of the key because it is only assigned (under a row lock) after the bytes
     * are stored; the database row links key and version.
     */
    public static String storageKey(UUID tenantId, UUID documentId) {
        return "t/" + tenantId + "/d/" + documentId + "/" + UUID.randomUUID();
    }

    public UUID getId() { return id; }
    public UUID getDocumentId() { return documentId; }
    public int getVersionNo() { return versionNo; }
    public String getStorageKey() { return storageKey; }
    public String getOriginalFilename() { return originalFilename; }
    public String getContentType() { return contentType; }
    public long getSizeBytes() { return sizeBytes; }
    public String getSha256() { return sha256; }
    public ProcessingStatus getProcessingStatus() { return processingStatus; }
    public String getChangeComment() { return changeComment; }
    public Integer getRestoredFromNo() { return restoredFromNo; }
    public UUID getCreatedBy() { return createdBy; }
    public Instant getCreatedAt() { return createdAt; }
}
