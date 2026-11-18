package com.manageedocs.tenancy;

import org.hibernate.context.spi.CurrentTenantIdentifierResolver;

import java.util.UUID;

/**
 * Plugged into Hibernate via {@code hibernate.tenant_identifier_resolver} (see application.yml).
 * Hibernate applies {@code tenant_id = <this value>} to every {@code @TenantId} entity read and
 * stamps it on every insert. With no tenant established it returns {@link TenantContext#NO_TENANT},
 * which matches nothing and violates the tenant FK on insert: fail closed.
 */
public class TenantIdentifierResolver implements CurrentTenantIdentifierResolver<UUID> {

    @Override
    public UUID resolveCurrentTenantIdentifier() {
        return TenantContext.current().orElse(TenantContext.NO_TENANT);
    }

    @Override
    public boolean validateExistingCurrentSessions() {
        return true;
    }
}
