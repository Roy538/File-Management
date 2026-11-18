package com.manageedocs.documents.model;

import com.manageedocs.common.persistence.TenantScopedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.time.Instant;
import java.util.UUID;

/**
 * The logical document. Its content lives in immutable {@link DocumentVersion}s; this row only
 * points at the current one. Concurrent edits are caught by the inherited {@code @Version}.
 */
@Entity
@Table(name = "document")
@SQLRestriction("deleted_at is null")
public class Document extends TenantScopedEntity {

    public enum Status { DRAFT, ACTIVE, UNDER_REVIEW, APPROVED, PUBLISHED, ARCHIVED }

    @Column(name = "cabinet_id", nullable = false)
    private UUID cabinetId;

    @Column(name = "folder_id", nullable = false)
    private UUID folderId;

    @Column(name = "sub_divider_id")
    private UUID subDividerId;

    @Column(name = "document_type_id")
    private UUID documentTypeId;

    @Column(nullable = false, length = 300)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status;

    @Column(name = "current_version_no", nullable = false)
    private int currentVersionNo;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(name = "locked_by")
    private UUID lockedBy;

    @Column(name = "locked_at")
    private Instant lockedAt;

    @Column(name = "lock_expires_at")
    private Instant lockExpiresAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "deleted_by")
    private UUID deletedBy;

    @Column(name = "archived_at")
    private Instant archivedAt;

    @Column(name = "destroyed_at")
    private Instant destroyedAt;

    protected Document() {
    }

    public Document(UUID cabinetId, UUID folderId, UUID subDividerId, UUID documentTypeId, String title, UUID ownerId) {
        this.cabinetId = cabinetId;
        this.folderId = folderId;
        this.subDividerId = subDividerId;
        this.documentTypeId = documentTypeId;
        retitle(title);
        this.ownerId = ownerId;
        this.status = Status.DRAFT;
        this.currentVersionNo = 1;
    }

    /** Reserves the next version number. The unique (document_id, version_no) key backs this up. */
    public int nextVersionNo() {
        return currentVersionNo + 1;
    }

    public void advanceTo(int versionNo) {
        if (versionNo != currentVersionNo + 1) throw new IllegalStateException("Versions must be sequential");
        this.currentVersionNo = versionNo;
    }

    public boolean isLockedByOther(UUID userId, Instant now) {
        return lockedBy != null && !lockedBy.equals(userId) && lockExpiresAt != null && lockExpiresAt.isAfter(now);
    }

    public boolean isLockedBy(UUID userId, Instant now) {
        return lockedBy != null && lockedBy.equals(userId) && lockExpiresAt != null && lockExpiresAt.isAfter(now);
    }

    /** Check-out. Re-checking out by the holder renews the lock. */
    public void lock(UUID userId, Instant now, Instant until) {
        if (isLockedByOther(userId, now)) throw new IllegalStateException("Document is checked out by another user");
        this.lockedBy = userId;
        this.lockedAt = now;
        this.lockExpiresAt = until;
    }

    public void unlock() {
        this.lockedBy = null;
        this.lockedAt = null;
        this.lockExpiresAt = null;
    }

    public void retitle(String newTitle) {
        String t = newTitle == null ? "" : newTitle.trim();
        if (t.isEmpty()) throw new IllegalArgumentException("Title is required");
        if (t.length() > 300) throw new IllegalArgumentException("Title must be at most 300 characters");
        this.title = t;
    }

    public void classify(UUID newDocumentTypeId) {
        this.documentTypeId = newDocumentTypeId;
    }

    public void softDelete(UUID by, Instant at) {
        this.deletedAt = at;
        this.deletedBy = by;
        unlock();
    }

    // ── Review lifecycle (driven by the workflow engine) ──

    public void submitForReview() {
        if (status == Status.UNDER_REVIEW || status == Status.ARCHIVED) {
            throw new IllegalStateException("A document that is " + status + " cannot be submitted for review");
        }
        this.status = Status.UNDER_REVIEW;
        unlock();
    }

    public void markApproved() {
        requireStatus(Status.UNDER_REVIEW);
        this.status = Status.APPROVED;
    }

    /** Rejected, changes requested, or review cancelled: back to the author. */
    public void returnToDraft() {
        if (status == Status.UNDER_REVIEW) this.status = Status.DRAFT;
    }

    public void publish() {
        requireStatus(Status.APPROVED);
        this.status = Status.PUBLISHED;
    }

    public boolean isUnderReview() {
        return status == Status.UNDER_REVIEW;
    }

    private void requireStatus(Status expected) {
        if (status != expected) throw new IllegalStateException("Document is " + status + "; expected " + expected);
    }

    /** Retention ARCHIVE: the document becomes read-only; content stays retrievable. */
    public void archive(Instant at) {
        this.status = Status.ARCHIVED;
        this.archivedAt = at;
        unlock();
    }

    public boolean isArchived() {
        return status == Status.ARCHIVED;
    }

    /** Disposition: removed from use; binaries are purged by the caller, this row remains as evidence. */
    public void destroy(UUID by, Instant at) {
        softDelete(by, at);
        this.destroyedAt = at;
    }

    public Instant getArchivedAt() { return archivedAt; }
    public UUID getCabinetId() { return cabinetId; }
    public UUID getFolderId() { return folderId; }
    public UUID getSubDividerId() { return subDividerId; }
    public UUID getDocumentTypeId() { return documentTypeId; }
    public String getTitle() { return title; }
    public Status getStatus() { return status; }
    public int getCurrentVersionNo() { return currentVersionNo; }
    public UUID getOwnerId() { return ownerId; }
    public UUID getLockedBy() { return lockedBy; }
    public Instant getLockedAt() { return lockedAt; }
    public Instant getLockExpiresAt() { return lockExpiresAt; }
}
