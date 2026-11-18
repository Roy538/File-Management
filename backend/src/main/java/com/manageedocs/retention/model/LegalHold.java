package com.manageedocs.retention.model;

import com.manageedocs.common.persistence.TenantScopedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** Preserves documents for litigation/investigation: while active, nothing it covers can be deleted or destroyed. */
@Entity
@Table(name = "legal_hold")
public class LegalHold extends TenantScopedEntity {

    @Column(nullable = false, length = 200)
    private String name;

    @Column(nullable = false, length = 1000)
    private String reason;

    @Column(name = "matter_ref", length = 100)
    private String matterRef;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "released_at")
    private Instant releasedAt;

    @Column(name = "released_by")
    private UUID releasedBy;

    @Column(name = "release_reason", length = 1000)
    private String releaseReason;

    protected LegalHold() {
    }

    public LegalHold(String name, String reason, String matterRef, UUID createdBy) {
        this.name = name.trim();
        this.reason = reason.trim();
        this.matterRef = matterRef == null || matterRef.isBlank() ? null : matterRef.trim();
        this.createdBy = createdBy;
    }

    public boolean isActive() {
        return releasedAt == null;
    }

    public void release(UUID by, String why, Instant at) {
        if (!isActive()) throw new IllegalStateException("This legal hold has already been released");
        this.releasedAt = at;
        this.releasedBy = by;
        this.releaseReason = why.trim();
    }

    public String getName() { return name; }
    public String getReason() { return reason; }
    public String getMatterRef() { return matterRef; }
    public UUID getCreatedBy() { return createdBy; }
    public Instant getReleasedAt() { return releasedAt; }
    public UUID getReleasedBy() { return releasedBy; }
    public String getReleaseReason() { return releaseReason; }
}
