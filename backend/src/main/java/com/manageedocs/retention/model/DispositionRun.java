package com.manageedocs.retention.model;

import com.manageedocs.common.persistence.TenantScopedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** A proposed batch of destructions awaiting a records manager's decision. */
@Entity
@Table(name = "disposition_run")
public class DispositionRun extends TenantScopedEntity {

    public enum Status { PROPOSED, EXECUTED, CANCELLED }

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status;

    @Column(name = "proposed_at", nullable = false)
    private Instant proposedAt;

    @Column(name = "decided_by")
    private UUID decidedBy;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "executed_at")
    private Instant executedAt;

    protected DispositionRun() {
    }

    public DispositionRun(Instant proposedAt) {
        this.status = Status.PROPOSED;
        this.proposedAt = proposedAt;
    }

    public void executed(UUID by, Instant at) {
        requireProposed();
        this.status = Status.EXECUTED;
        this.decidedBy = by;
        this.decidedAt = at;
        this.executedAt = at;
    }

    public void cancel(UUID by, Instant at) {
        requireProposed();
        this.status = Status.CANCELLED;
        this.decidedBy = by;
        this.decidedAt = at;
    }

    private void requireProposed() {
        if (status != Status.PROPOSED) throw new IllegalStateException("This disposition run has already been decided");
    }

    public Status getStatus() { return status; }
    public Instant getProposedAt() { return proposedAt; }
    public UUID getDecidedBy() { return decidedBy; }
    public Instant getDecidedAt() { return decidedAt; }
    public Instant getExecutedAt() { return executedAt; }
}
