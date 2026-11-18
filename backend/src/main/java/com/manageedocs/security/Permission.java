package com.manageedocs.security;

/**
 * Fixed capability catalog: what features a user may use at all. The enum name is the stored
 * value and the Spring authority (checked with {@code @PreAuthorize("hasAuthority('…')")});
 * {@link #getCode()} is the stable "resource:action" identifier exposed to clients.
 *
 * <p>Capabilities answer "may this caller use this endpoint?". Which <em>objects</em> they may
 * touch is decided separately by {@link com.manageedocs.permissions.service.AccessPolicy}
 * (cabinet visibility + ACL grants). Both layers apply to every request.
 *
 * <p>Only capabilities with a working endpoint are listed; new ones arrive with their module.
 * Never rename or remove a constant that may be stored in {@code user_permission}.
 */
public enum Permission {
    // Platform-level: super admin only, never grantable to tenant users
    PLATFORM_MANAGE_TENANTS("platform_tenants:manage"),
    PLATFORM_VIEW_ALL("platform:read"),

    // Organisation administration
    TENANT_SETTINGS_MANAGE("settings:manage"),
    TENANT_USERS_VIEW("users:read"),
    TENANT_USERS_MANAGE("users:manage"),
    AUDIT_TRAIL_VIEW("audit:read"),

    // Filing structure
    CABINETS_VIEW("cabinets:read"),
    CABINETS_MANAGE("cabinets:manage"),
    DOCUMENT_TYPES_MANAGE("document_types:manage"),
    /** Grant and revoke per-object access (ACLs). Still limited to objects the caller can MANAGE. */
    ACCESS_MANAGE("access:manage"),

    // Documents
    DOCUMENTS_VIEW("documents:read"),
    DOCUMENTS_DOWNLOAD("documents:download"),
    DOCUMENTS_UPLOAD("documents:upload"),
    DOCUMENTS_EDIT("documents:edit"),
    DOCUMENTS_DELETE("documents:delete"),
    /** Force-release another user's check-out lock. */
    DOCUMENTS_LOCK_OVERRIDE("documents:lock_override"),

    // Governance
    /** Define retention policies, assign them, and approve or cancel disposition (destruction) runs. */
    RETENTION_MANAGE("retention:manage"),
    /** Place and release legal holds. */
    LEGAL_HOLD_MANAGE("legal_holds:manage"),

    // Operations
    /** Inspect the processing pipeline, reprocess documents, rebuild the search index. */
    PROCESSING_MANAGE("processing:manage");

    private final String code;

    Permission(String code) {
        this.code = code;
    }

    public String getCode() {
        return code;
    }

    public boolean isPlatformLevel() {
        return name().startsWith("PLATFORM_");
    }
}
