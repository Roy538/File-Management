package com.manageedocs.workflows.model;

import com.manageedocs.common.persistence.Ids;
import com.manageedocs.identity.model.Role;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.TenantId;

import java.util.UUID;

/** One stage of a definition version. Decided by any holder of {@code assigneeRole}, or by named users. */
@Entity
@Immutable
@Table(name = "workflow_step")
public class WorkflowStep {

    /** ANY: the first decision settles the step. ALL: every named user must approve. */
    public enum Mode { ANY, ALL }

    @Id
    private UUID id = Ids.newId();

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "definition_version_id", nullable = false)
    private UUID definitionVersionId;

    @Column(name = "step_order", nullable = false)
    private int stepOrder;

    @Column(nullable = false, length = 200)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "approval_mode", nullable = false, length = 8)
    private Mode mode;

    @Enumerated(EnumType.STRING)
    @Column(name = "assignee_role", length = 32)
    private Role assigneeRole;

    @Column(name = "due_days")
    private Integer dueDays;

    protected WorkflowStep() {
    }

    public WorkflowStep(UUID definitionVersionId, int stepOrder, String name, Mode mode, Role assigneeRole, Integer dueDays) {
        this.definitionVersionId = definitionVersionId;
        this.stepOrder = stepOrder;
        this.name = name.trim();
        this.mode = mode;
        this.assigneeRole = assigneeRole;
        this.dueDays = dueDays;
    }

    public UUID getId() { return id; }
    public UUID getDefinitionVersionId() { return definitionVersionId; }
    public int getStepOrder() { return stepOrder; }
    public String getName() { return name; }
    public Mode getMode() { return mode; }
    public Role getAssigneeRole() { return assigneeRole; }
    public Integer getDueDays() { return dueDays; }
}
