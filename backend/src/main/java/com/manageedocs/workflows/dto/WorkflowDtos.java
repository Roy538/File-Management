package com.manageedocs.workflows.dto;

import com.manageedocs.identity.model.Role;
import com.manageedocs.workflows.model.WorkflowInstance;
import com.manageedocs.workflows.model.WorkflowStep;
import com.manageedocs.workflows.model.WorkflowTask;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class WorkflowDtos {

    private WorkflowDtos() {
    }

    /** Exactly one of {@code assigneeRole} / {@code assigneeUserIds}. ALL mode needs named users. */
    public record StepSpec(
            @NotBlank @Size(max = 200) String name,
            @NotNull WorkflowStep.Mode approvalMode,
            Role assigneeRole,
            List<UUID> assigneeUserIds,
            @Min(0) Integer dueDays) {
    }

    public record DefinitionRequest(
            @NotBlank @Size(max = 200) String name,
            @Size(max = 1000) String description,
            @NotEmpty @Valid List<StepSpec> steps) {
    }

    public record StepView(int order, String name, WorkflowStep.Mode approvalMode, Role assigneeRole,
                           List<UUID> assigneeUserIds, Integer dueDays) {
    }

    public record DefinitionView(UUID id, String name, String description, boolean active, int currentVersionNo,
                                 List<StepView> steps) {
    }

    public record SubmitRequest(@NotNull UUID definitionId, @Size(max = 2000) String comment) {
    }

    public enum Decision { APPROVE, REJECT, REQUEST_CHANGES }

    public record DecisionRequest(@NotNull Decision decision, @Size(max = 2000) String comment) {
    }

    public record DelegateRequest(@NotNull UUID toUserId, @Size(max = 2000) String comment) {
    }

    public record CommentRequest(@Size(max = 2000) String comment) {
    }

    public record TaskView(UUID id, UUID instanceId, UUID documentId, String documentTitle, int stepOrder,
                           String stepName, UUID assigneeUserId, Role assigneeRole, WorkflowTask.Status status,
                           UUID decidedBy, Instant decidedAt, String comment, Instant dueAt, boolean overdue,
                           Instant escalatedAt, UUID delegatedFrom, Instant createdAt) {
    }

    public record EventView(String action, UUID actorId, String fromStatus, String toStatus, String comment,
                            Instant occurredAt) {
    }

    public record InstanceView(UUID id, UUID documentId, String definitionName, int definitionVersionNo,
                               int documentVersionNo, WorkflowInstance.Status status, int currentStepOrder,
                               UUID initiatedBy, Instant startedAt, Instant completedAt, List<TaskView> tasks,
                               List<EventView> history) {
    }
}
