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

@Entity
@Immutable
@Table(name = "workflow_definition_version")
public class WorkflowDefinitionVersion {

    @Id
    private UUID id = Ids.newId();

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "definition_id", nullable = false)
    private UUID definitionId;

    @Column(name = "version_no", nullable = false)
    private int versionNo;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected WorkflowDefinitionVersion() {
    }

    public WorkflowDefinitionVersion(UUID definitionId, int versionNo, UUID createdBy, Instant createdAt) {
        this.definitionId = definitionId;
        this.versionNo = versionNo;
        this.createdBy = createdBy;
        this.createdAt = createdAt;
    }

    public UUID getId() { return id; }
    public UUID getDefinitionId() { return definitionId; }
    public int getVersionNo() { return versionNo; }
    public UUID getCreatedBy() { return createdBy; }
    public Instant getCreatedAt() { return createdAt; }
}
