package com.manageedocs.common.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;
import org.hibernate.annotations.TenantId;

import java.util.UUID;

/**
 * Base for every tenant-owned row (ADR-004). Hibernate fills {@code tenant_id} on insert
 * and adds {@code tenant_id = :current} to every query from the
 * {@link com.manageedocs.tenancy.TenantIdentifierResolver}, which reads the tenant
 * from the authenticated principal only — never from request input.
 */
@MappedSuperclass
public abstract class TenantScopedEntity extends BaseEntity {

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    public UUID getTenantId() {
        return tenantId;
    }
}
