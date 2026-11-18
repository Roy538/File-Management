package com.manageedocs.retention.model;

import com.manageedocs.common.persistence.Ids;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "disposition_item")
public class DispositionItem {

    public enum Outcome { PENDING, DESTROYED, SKIPPED_HOLD, SKIPPED_CHANGED, SKIPPED_EXCLUDED }

    @Id
    private UUID id = Ids.newId();

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "disposition_run_id", nullable = false)
    private UUID runId;

    @Column(name = "document_id", nullable = false)
    private UUID documentId;

    @Column(name = "retention_policy_id", nullable = false)
    private UUID policyId;

    @Column(name = "due_at", nullable = false)
    private Instant dueAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Outcome outcome;

    @Column(length = 500)
    private String note;

    protected DispositionItem() {
    }

    public DispositionItem(UUID runId, UUID documentId, UUID policyId, Instant dueAt) {
        this.runId = runId;
        this.documentId = documentId;
        this.policyId = policyId;
        this.dueAt = dueAt;
        this.outcome = Outcome.PENDING;
    }

    public void resolve(Outcome o, String why) {
        this.outcome = o;
        this.note = why;
    }

    public UUID getId() { return id; }
    public UUID getRunId() { return runId; }
    public UUID getDocumentId() { return documentId; }
    public UUID getPolicyId() { return policyId; }
    public Instant getDueAt() { return dueAt; }
    public Outcome getOutcome() { return outcome; }
    public String getNote() { return note; }
}
