package com.manageedocs.taxonomy.model;

import com.manageedocs.common.persistence.TenantScopedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "document_type")
public class DocumentType extends TenantScopedEntity {

    @Column(nullable = false, length = 200)
    private String name;

    @Column(length = 1000)
    private String description;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "retention_policy_id")
    private java.util.UUID retentionPolicyId;

    protected DocumentType() {
    }

    public DocumentType(String name, String description) {
        this.name = name.trim();
        this.description = description == null || description.isBlank() ? null : description.trim();
    }

    public void update(String newName, String newDescription) {
        this.name = newName.trim();
        this.description = newDescription == null || newDescription.isBlank() ? null : newDescription.trim();
    }

    public void deactivate() {
        this.active = false;
    }

    public void assignRetentionPolicy(java.util.UUID policyId) {
        this.retentionPolicyId = policyId;
    }

    public java.util.UUID getRetentionPolicyId() { return retentionPolicyId; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public boolean isActive() { return active; }
}
