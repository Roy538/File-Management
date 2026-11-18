package com.manageedocs.permissions.model;

import com.manageedocs.common.persistence.TenantScopedEntity;
import com.manageedocs.identity.model.Role;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.util.UUID;

/** A grant of rights on one resource to one user or to everyone holding a role. */
@Entity
@Table(name = "acl_entry")
public class AclEntry extends TenantScopedEntity {

    public enum ResourceType { CABINET, FOLDER, DOCUMENT }

    public enum PrincipalType { USER, ROLE }

    @Enumerated(EnumType.STRING)
    @Column(name = "resource_type", nullable = false, length = 16)
    private ResourceType resourceType;

    @Column(name = "resource_id", nullable = false)
    private UUID resourceId;

    @Enumerated(EnumType.STRING)
    @Column(name = "principal_type", nullable = false, length = 8)
    private PrincipalType principalType;

    @Column(name = "user_id")
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(length = 32)
    private Role role;

    @Column(nullable = false)
    private int permissions;

    @Column(name = "granted_by")
    private UUID grantedBy;

    protected AclEntry() {
    }

    private AclEntry(ResourceType resourceType, UUID resourceId, PrincipalType principalType, UUID userId, Role role,
                     int permissions, UUID grantedBy) {
        if (permissions <= 0) throw new IllegalArgumentException("A grant needs at least one permission");
        this.resourceType = resourceType;
        this.resourceId = resourceId;
        this.principalType = principalType;
        this.userId = userId;
        this.role = role;
        this.permissions = permissions;
        this.grantedBy = grantedBy;
    }

    public static AclEntry forUser(ResourceType type, UUID resourceId, UUID userId, int permissions, UUID grantedBy) {
        return new AclEntry(type, resourceId, PrincipalType.USER, userId, null, permissions, grantedBy);
    }

    public static AclEntry forRole(ResourceType type, UUID resourceId, Role role, int permissions, UUID grantedBy) {
        return new AclEntry(type, resourceId, PrincipalType.ROLE, null, role, permissions, grantedBy);
    }

    public ResourceType getResourceType() { return resourceType; }
    public UUID getResourceId() { return resourceId; }
    public PrincipalType getPrincipalType() { return principalType; }
    public UUID getUserId() { return userId; }
    public Role getRole() { return role; }
    public int getPermissions() { return permissions; }
    public UUID getGrantedBy() { return grantedBy; }
}
