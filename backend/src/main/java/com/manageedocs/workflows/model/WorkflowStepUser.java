package com.manageedocs.workflows.model;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.TenantId;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Entity
@Immutable
@Table(name = "workflow_step_user")
public class WorkflowStepUser {

    @Embeddable
    public static class Key implements Serializable {
        @Column(name = "step_id")
        private UUID stepId;

        @Column(name = "user_id")
        private UUID userId;

        protected Key() {
        }

        public Key(UUID stepId, UUID userId) {
            this.stepId = stepId;
            this.userId = userId;
        }

        @Override
        public boolean equals(Object o) {
            return o instanceof Key k && Objects.equals(stepId, k.stepId) && Objects.equals(userId, k.userId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(stepId, userId);
        }
    }

    @EmbeddedId
    private Key id;

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    protected WorkflowStepUser() {
    }

    public WorkflowStepUser(UUID stepId, UUID userId) {
        this.id = new Key(stepId, userId);
    }

    public UUID stepId() { return id.stepId; }
    public UUID userId() { return id.userId; }
}
