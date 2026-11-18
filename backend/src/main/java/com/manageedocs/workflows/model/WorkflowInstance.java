package com.manageedocs.workflows.model;

import com.manageedocs.common.persistence.TenantScopedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

/**
 * One run of a definition version against one document. State machine (enforced here, never in
 * the UI):
 * <pre>
 * IN_PROGRESS ──approve(last step)──▶ APPROVED
 *      │ ──reject──▶ REJECTED
 *      │ ──request changes──▶ CHANGES_REQUESTED ──resubmit──▶ IN_PROGRESS (from step 1)
 *      └ ──cancel──▶ CANCELLED            (CHANGES_REQUESTED can also be cancelled)
 * </pre>
 */
@Entity
@Table(name = "workflow_instance")
public class WorkflowInstance extends TenantScopedEntity {

    public enum Status {
        IN_PROGRESS, CHANGES_REQUESTED, APPROVED, REJECTED, CANCELLED;

        public boolean isOpen() {
            return this == IN_PROGRESS || this == CHANGES_REQUESTED;
        }
    }

    private static final Set<Status> CANCELLABLE = EnumSet.of(Status.IN_PROGRESS, Status.CHANGES_REQUESTED);

    @Column(name = "definition_version_id", nullable = false)
    private UUID definitionVersionId;

    @Column(name = "document_id", nullable = false)
    private UUID documentId;

    @Column(name = "document_version_no", nullable = false)
    private int documentVersionNo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    @Column(name = "current_step_order", nullable = false)
    private int currentStepOrder;

    @Column(name = "initiated_by", nullable = false)
    private UUID initiatedBy;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    protected WorkflowInstance() {
    }

    public WorkflowInstance(UUID definitionVersionId, UUID documentId, int documentVersionNo, int firstStep,
                            UUID initiatedBy, Instant now) {
        this.definitionVersionId = definitionVersionId;
        this.documentId = documentId;
        this.documentVersionNo = documentVersionNo;
        this.status = Status.IN_PROGRESS;
        this.currentStepOrder = firstStep;
        this.initiatedBy = initiatedBy;
        this.startedAt = now;
    }

    public void advanceTo(int stepOrder) {
        require(Status.IN_PROGRESS);
        this.currentStepOrder = stepOrder;
    }

    public void approve(Instant now) {
        require(Status.IN_PROGRESS);
        this.status = Status.APPROVED;
        this.completedAt = now;
    }

    public void reject(Instant now) {
        require(Status.IN_PROGRESS);
        this.status = Status.REJECTED;
        this.completedAt = now;
    }

    public void requestChanges() {
        require(Status.IN_PROGRESS);
        this.status = Status.CHANGES_REQUESTED;
    }

    public void resubmit(int newDocumentVersionNo, int firstStep) {
        require(Status.CHANGES_REQUESTED);
        this.status = Status.IN_PROGRESS;
        this.documentVersionNo = newDocumentVersionNo;
        this.currentStepOrder = firstStep;
    }

    public void cancel(Instant now) {
        if (!CANCELLABLE.contains(status)) throw new IllegalStateException("Only open workflows can be cancelled");
        this.status = Status.CANCELLED;
        this.completedAt = now;
    }

    private void require(Status expected) {
        if (status != expected) {
            throw new IllegalStateException("Workflow is " + status + "; this action needs " + expected);
        }
    }

    public UUID getDefinitionVersionId() { return definitionVersionId; }
    public UUID getDocumentId() { return documentId; }
    public int getDocumentVersionNo() { return documentVersionNo; }
    public Status getStatus() { return status; }
    public int getCurrentStepOrder() { return currentStepOrder; }
    public UUID getInitiatedBy() { return initiatedBy; }
    public Instant getStartedAt() { return startedAt; }
    public Instant getCompletedAt() { return completedAt; }
}
