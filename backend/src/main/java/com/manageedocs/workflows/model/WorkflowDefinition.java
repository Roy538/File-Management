package com.manageedocs.workflows.model;

import com.manageedocs.common.persistence.TenantScopedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/** A named approval process. Its steps live in immutable {@link WorkflowDefinitionVersion}s. */
@Entity
@Table(name = "workflow_definition")
public class WorkflowDefinition extends TenantScopedEntity {

    @Column(nullable = false, length = 200)
    private String name;

    @Column(length = 1000)
    private String description;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "current_version_no", nullable = false)
    private int currentVersionNo;

    protected WorkflowDefinition() {
    }

    public WorkflowDefinition(String name, String description) {
        this.name = name.trim();
        this.description = description == null || description.isBlank() ? null : description.trim();
        this.currentVersionNo = 1;
    }

    /** Returns the number for a new version; existing instances keep the version they started on. */
    public int revise() {
        return ++currentVersionNo;
    }

    public void deactivate() {
        this.active = false;
    }

    public String getName() { return name; }
    public String getDescription() { return description; }
    public boolean isActive() { return active; }
    public int getCurrentVersionNo() { return currentVersionNo; }
}
