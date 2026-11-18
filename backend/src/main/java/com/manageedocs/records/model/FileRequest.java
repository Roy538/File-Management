package com.manageedocs.records.model;

import com.manageedocs.common.persistence.TenantScopedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** A department's request to borrow a physical file. PENDING → APPROVED → FULFILLED, or REJECTED / CANCELLED. */
@Entity
@Table(name = "file_request")
public class FileRequest extends TenantScopedEntity {

    public enum Status { PENDING, APPROVED, REJECTED, CANCELLED, FULFILLED }

    @Column(name = "file_id", nullable = false)
    private UUID fileId;

    @Column(name = "requested_by", nullable = false)
    private UUID requestedBy;

    @Column(nullable = false, length = 200)
    private String department;

    @Column(length = 1000)
    private String purpose;

    @Column(name = "needed_by")
    private LocalDate neededBy;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status = Status.PENDING;

    @Column(name = "decided_by")
    private UUID decidedBy;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "decision_notes", length = 1000)
    private String decisionNotes;

    @Column(name = "dispatch_id")
    private UUID dispatchId;

    protected FileRequest() {
    }

    public FileRequest(UUID fileId, UUID requestedBy, String department, String purpose, LocalDate neededBy) {
        this.fileId = fileId;
        this.requestedBy = requestedBy;
        this.department = department.trim();
        this.purpose = purpose == null || purpose.isBlank() ? null : purpose.trim();
        this.neededBy = neededBy;
    }

    public void decide(boolean approve, UUID by, String notes, Instant at) {
        require(Status.PENDING, approve ? "approved" : "rejected");
        this.status = approve ? Status.APPROVED : Status.REJECTED;
        this.decidedBy = by;
        this.decidedAt = at;
        this.decisionNotes = notes == null || notes.isBlank() ? null : notes.trim();
    }

    public void cancel() {
        if (status != Status.PENDING && status != Status.APPROVED) {
            throw new IllegalStateException("Only a pending or approved request can be cancelled");
        }
        this.status = Status.CANCELLED;
    }

    public void fulfil(UUID dispatchId) {
        require(Status.APPROVED, "dispatched");
        this.status = Status.FULFILLED;
        this.dispatchId = dispatchId;
    }

    private void require(Status expected, String verb) {
        if (status != expected) {
            throw new IllegalStateException("A " + status.name().toLowerCase() + " request cannot be " + verb);
        }
    }

    public UUID getFileId() { return fileId; }
    public UUID getRequestedBy() { return requestedBy; }
    public String getDepartment() { return department; }
    public String getPurpose() { return purpose; }
    public LocalDate getNeededBy() { return neededBy; }
    public Status getStatus() { return status; }
    public UUID getDecidedBy() { return decidedBy; }
    public Instant getDecidedAt() { return decidedAt; }
    public String getDecisionNotes() { return decisionNotes; }
    public UUID getDispatchId() { return dispatchId; }
}
