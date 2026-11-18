package com.manageedocs.processing.model;

import com.manageedocs.common.persistence.Ids;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * One processing run (scan → extract → index) for one document version. Not tenant-filtered:
 * the background worker claims across tenants and pins {@link #getTenantId()} before touching
 * tenant data (the reference platform's "job carries its own identity" rule).
 */
@Entity
@Table(name = "processing_job")
public class ProcessingJob {

    public enum Status { PENDING, RUNNING, DONE, DEAD }

    public enum ScanResult { CLEAN, INFECTED, SKIPPED }

    @Id
    private UUID id = Ids.newId();

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "document_id", nullable = false, updatable = false)
    private UUID documentId;

    @Column(name = "document_version_id", nullable = false, updatable = false)
    private UUID documentVersionId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "next_attempt_at", nullable = false)
    private Instant nextAttemptAt;

    @Column(name = "claimed_at")
    private Instant claimedAt;

    @Column(name = "claimed_by", length = 64)
    private String claimedBy;

    @Enumerated(EnumType.STRING)
    @Column(name = "scan_result", length = 16)
    private ScanResult scanResult;

    @Column(name = "extracted_chars")
    private Integer extractedChars;

    @Column(name = "last_error", length = 1000)
    private String lastError;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    protected ProcessingJob() {
    }

    public ProcessingJob(UUID tenantId, UUID documentId, UUID documentVersionId, Instant now) {
        this.tenantId = tenantId;
        this.documentId = documentId;
        this.documentVersionId = documentVersionId;
        this.status = Status.PENDING;
        this.nextAttemptAt = now;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void claim(String worker, Instant now) {
        this.status = Status.RUNNING;
        this.claimedAt = now;
        this.claimedBy = worker;
        this.attempts++;
        this.updatedAt = now;
    }

    public void succeed(ScanResult scan, Integer chars, String note, Instant now) {
        this.status = Status.DONE;
        this.scanResult = scan;
        this.extractedChars = chars;
        this.lastError = truncate(note);
        this.completedAt = now;
        this.updatedAt = now;
    }

    /** Retry with exponential backoff, or give up (dead letter) after {@code maxAttempts}. */
    public boolean fail(String error, int maxAttempts, Duration base, Instant now) {
        this.lastError = truncate(error);
        this.updatedAt = now;
        this.claimedAt = null;
        this.claimedBy = null;
        if (attempts >= maxAttempts) {
            this.status = Status.DEAD;
            this.completedAt = now;
            return false;
        }
        this.status = Status.PENDING;
        this.nextAttemptAt = now.plus(base.multipliedBy(1L << Math.min(attempts - 1, 10)));
        return true;
    }

    /** Manual or automatic reprocessing: same row (idempotency key), fresh attempt budget. */
    public void reset(Instant now) {
        this.status = Status.PENDING;
        this.attempts = 0;
        this.nextAttemptAt = now;
        this.claimedAt = null;
        this.claimedBy = null;
        this.scanResult = null;
        this.extractedChars = null;
        this.lastError = null;
        this.completedAt = null;
        this.updatedAt = now;
    }

    private static String truncate(String s) {
        return s == null ? null : s.length() > 1000 ? s.substring(0, 1000) : s;
    }

    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public UUID getDocumentId() { return documentId; }
    public UUID getDocumentVersionId() { return documentVersionId; }
    public Status getStatus() { return status; }
    public int getAttempts() { return attempts; }
    public Instant getNextAttemptAt() { return nextAttemptAt; }
    public Instant getClaimedAt() { return claimedAt; }
    public ScanResult getScanResult() { return scanResult; }
    public Integer getExtractedChars() { return extractedChars; }
    public String getLastError() { return lastError; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getCompletedAt() { return completedAt; }
}
