package com.manageedocs.workflows.model;

import com.manageedocs.common.persistence.Ids;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/** Append-only history of an instance: who did what, when, between which states, and why. */
@Entity
@Immutable
@Table(name = "workflow_event")
public class WorkflowEvent {

    @Id
    private UUID id = Ids.newId();

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "instance_id", nullable = false)
    private UUID instanceId;

    @Column(name = "task_id")
    private UUID taskId;

    @Column(nullable = false, length = 32)
    private String action;

    @Column(name = "actor_id")
    private UUID actorId;

    @Column(name = "from_status", length = 20)
    private String fromStatus;

    @Column(name = "to_status", length = 20)
    private String toStatus;

    @Column(length = 2000)
    private String comment;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    protected WorkflowEvent() {
    }

    public WorkflowEvent(UUID instanceId, UUID taskId, String action, UUID actorId, String fromStatus, String toStatus,
                         String comment, Instant occurredAt) {
        this.instanceId = instanceId;
        this.taskId = taskId;
        this.action = action;
        this.actorId = actorId;
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
        this.comment = comment == null || comment.isBlank() ? null : comment.trim();
        this.occurredAt = occurredAt;
    }

    public UUID getInstanceId() { return instanceId; }
    public UUID getTaskId() { return taskId; }
    public String getAction() { return action; }
    public UUID getActorId() { return actorId; }
    public String getFromStatus() { return fromStatus; }
    public String getToStatus() { return toStatus; }
    public String getComment() { return comment; }
    public Instant getOccurredAt() { return occurredAt; }
}
