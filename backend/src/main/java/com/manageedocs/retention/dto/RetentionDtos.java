package com.manageedocs.retention.dto;

import com.manageedocs.retention.model.DispositionItem;
import com.manageedocs.retention.model.DispositionRun;
import com.manageedocs.retention.model.RetentionPolicy;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public final class RetentionDtos {

    private RetentionDtos() {
    }

    public record CreatePolicyRequest(
            @NotBlank @Size(max = 200) String name,
            @Size(max = 1000) String description,
            @NotBlank @Size(max = 16) String retainFor,
            @NotNull RetentionPolicy.Trigger trigger,
            @NotNull RetentionPolicy.Action action) {
    }

    public record PolicyView(UUID id, String name, String description, String retainFor, RetentionPolicy.Trigger trigger,
                             RetentionPolicy.Action action, boolean active) {
        public static PolicyView of(RetentionPolicy p) {
            return new PolicyView(p.getId(), p.getName(), p.getDescription(), p.getRetainFor(), p.getTrigger(),
                    p.getAction(), p.isActive());
        }
    }

    /** {@code policyId} null removes the assignment. */
    public record AssignPolicyRequest(UUID policyId) {
    }

    public record DueDocument(UUID documentId, String title, UUID policyId, String policyName,
                              RetentionPolicy.Action action, Instant dueAt, boolean onLegalHold) {
    }

    public record EvaluationResult(int archived, int proposedForDestruction, int skippedUnderHold, UUID proposedRunId) {
    }

    public record DispositionItemView(UUID documentId, String title, UUID policyId, Instant dueAt,
                                      DispositionItem.Outcome outcome, String note) {
    }

    public record DispositionRunView(UUID id, DispositionRun.Status status, Instant proposedAt, UUID decidedBy,
                                     Instant decidedAt, Instant executedAt, List<DispositionItemView> items) {
    }

    /** Documents the records manager chose to keep despite being due (recorded as SKIPPED_EXCLUDED). */
    public record ApproveRunRequest(Set<UUID> excludeDocumentIds) {
    }

    public record CreateHoldRequest(
            @NotBlank @Size(max = 200) String name,
            @NotBlank @Size(max = 1000) String reason,
            @Size(max = 100) String matterRef) {
    }

    /** Add explicit documents and/or every current document in a folder's subtree. */
    public record AddToHoldRequest(Set<UUID> documentIds, UUID folderId) {
    }

    public record ReleaseHoldRequest(@NotBlank @Size(max = 1000) String reason) {
    }

    public record HeldDocumentView(UUID documentId, String title, UUID addedBy, Instant addedAt) {
    }

    public record HoldView(UUID id, String name, String reason, String matterRef, boolean active, UUID createdBy,
                           Instant createdAt, Instant releasedAt, String releaseReason, List<HeldDocumentView> documents) {
    }
}
