package com.manageedocs.taxonomy.model;

import com.manageedocs.common.persistence.TenantScopedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "cabinet")
@SQLRestriction("deleted_at is null")
public class Cabinet extends TenantScopedEntity {

    /**
     * DEFAULT: everyone in the organisation (rights by role). PRIVATE: owner + explicit grants.
     * PERSONAL: owner only (and organisation administrators, for records oversight).
     */
    public enum Visibility { DEFAULT, PRIVATE, PERSONAL }

    @Column(nullable = false, length = 200)
    private String name;

    @Column(length = 1000)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Visibility visibility;

    @Column(name = "owner_id")
    private UUID ownerId;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "retention_policy_id")
    private UUID retentionPolicyId;

    protected Cabinet() {
    }

    public Cabinet(String name, String description, Visibility visibility, UUID ownerId) {
        rename(name);
        this.description = blankToNull(description);
        this.visibility = visibility;
        // Default cabinets are organisational; Private/Personal always have an owner.
        this.ownerId = ownerId;
        if (visibility != Visibility.DEFAULT && ownerId == null) {
            throw new IllegalArgumentException("Private and personal cabinets need an owner");
        }
    }

    public void rename(String newName) {
        this.name = newName.trim();
    }

    public void describe(String newDescription) {
        this.description = blankToNull(newDescription);
    }

    public void softDelete(Instant at) {
        this.deletedAt = at;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    public void assignRetentionPolicy(UUID policyId) {
        this.retentionPolicyId = policyId;
    }

    public UUID getRetentionPolicyId() { return retentionPolicyId; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public Visibility getVisibility() { return visibility; }
    public UUID getOwnerId() { return ownerId; }
}
