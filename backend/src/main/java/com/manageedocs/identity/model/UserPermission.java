package com.manageedocs.identity.model;

import com.manageedocs.security.Permission;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import org.hibernate.annotations.TenantId;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** A per-user override of the role defaults: GRANT adds a capability, DENY removes one. */
@Entity
@Table(name = "user_permission")
public class UserPermission {

    public enum Effect { GRANT, DENY }

    @Embeddable
    public static class Key implements Serializable {
        @Column(name = "user_id")
        private UUID userId;

        @Enumerated(EnumType.STRING)
        @Column(name = "permission", length = 48)
        private Permission permission;

        protected Key() {
        }

        public Key(UUID userId, Permission permission) {
            this.userId = userId;
            this.permission = permission;
        }

        @Override
        public boolean equals(Object o) {
            return o instanceof Key k && Objects.equals(userId, k.userId) && permission == k.permission;
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, permission);
        }
    }

    @EmbeddedId
    private Key id;

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 5)
    private Effect effect;

    @Column(name = "granted_by")
    private UUID grantedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected UserPermission() {
    }

    public UserPermission(UUID userId, Permission permission, Effect effect, UUID grantedBy) {
        this.id = new Key(userId, permission);
        this.effect = effect;
        this.grantedBy = grantedBy;
        this.createdAt = Instant.now();
    }

    public Permission getPermission() {
        return id.permission;
    }

    public Effect getEffect() {
        return effect;
    }
}
