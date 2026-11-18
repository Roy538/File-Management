package com.manageedocs.workflows.model;

import com.manageedocs.common.persistence.TenantScopedEntity;
import com.manageedocs.identity.model.Role;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** A decision owed by a user (or by any holder of a role) at one step of an instance. */
@Entity
@Table(name = "workflow_task")
public class WorkflowTask extends TenantScopedEntity {

    public enum Status { OPEN, APPROVED, REJECTED, CHANGES_REQUESTED, SUPERSEDED, CANCELLED }

    @Column(name = "instance_id", nullable = false)
    private UUID instanceId;

    @Column(name = "step_order", nullable = false)
    private int stepOrder;

    @Column(name = "step_name", nullable = false, length = 200)
    private String stepName;

    @Column(name = "assignee_user_id")
    private UUID assigneeUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "assignee_role", length = 32)
    private Role assigneeRole;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    @Column(name = "decided_by")
    private UUID decidedBy;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "decision_comment", length = 2000)
    private String comment;

    @Column(name = "due_at")
    private Instant dueAt;

    @Column(name = "escalated_at")
    private Instant escalatedAt;

    @Column(name = "delegated_from")
    private UUID delegatedFrom;

    protected WorkflowTask() {
    }

    private WorkflowTask(UUID instanceId, WorkflowStep step, UUID userId, Role role, Instant dueAt) {
        this.instanceId = instanceId;
        this.stepOrder = step.getStepOrder();
        this.stepName = step.getName();
        this.assigneeUserId = userId;
        this.assigneeRole = role;
        this.status = Status.OPEN;
        this.dueAt = dueAt;
    }

    public static WorkflowTask forUser(UUID instanceId, WorkflowStep step, UUID userId, Instant dueAt) {
        return new WorkflowTask(instanceId, step, userId, null, dueAt);
    }

    public static WorkflowTask forRole(UUID instanceId, WorkflowStep step, Role role, Instant dueAt) {
        return new WorkflowTask(instanceId, step, null, role, dueAt);
    }

    public boolean isAssignedTo(UUID userId, Role role) {
        return userId.equals(assigneeUserId) || (assigneeRole != null && assigneeRole == role);
    }

    public void decide(Status outcome, UUID by, String why, Instant at) {
        if (status != Status.OPEN) throw new IllegalStateException("This task has already been decided");
        this.status = outcome;
        this.decidedBy = by;
        this.comment = why == null || why.isBlank() ? null : why.trim();
        this.decidedAt = at;
    }

    /** Closes an open task without a decision of its own (another task settled the step, or the instance ended). */
    public void close(Status how, Instant at) {
        if (status == Status.OPEN) {
            this.status = how;
            this.decidedAt = at;
        }
    }

    public void delegateTo(UUID newAssignee, UUID from) {
        if (status != Status.OPEN) throw new IllegalStateException("Only open tasks can be delegated");
        this.delegatedFrom = from;
        this.assigneeUserId = newAssignee;
        this.assigneeRole = null;
    }

    public void markEscalated(Instant at) {
        this.escalatedAt = at;
    }

    public UUID getInstanceId() { return instanceId; }
    public int getStepOrder() { return stepOrder; }
    public String getStepName() { return stepName; }
    public UUID getAssigneeUserId() { return assigneeUserId; }
    public Role getAssigneeRole() { return assigneeRole; }
    public Status getStatus() { return status; }
    public UUID getDecidedBy() { return decidedBy; }
    public Instant getDecidedAt() { return decidedAt; }
    public String getComment() { return comment; }
    public Instant getDueAt() { return dueAt; }
    public Instant getEscalatedAt() { return escalatedAt; }
    public UUID getDelegatedFrom() { return delegatedFrom; }
}
