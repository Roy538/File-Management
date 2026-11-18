package com.manageedocs.identity.model;

/**
 * Platform roles. Values match the legacy system so data migration is 1:1 (ADR-010).
 * Fine-grained rights (per cabinet/folder/document) come from ACLs in the permissions module.
 */
public enum Role {
    /** Platform operator; cross-tenant operations require an explicit audited bypass. */
    SUPER_ADMIN,
    /** Organisation administrator. */
    ADMIN,
    /** Records / document officer: files, dispatches, uploads, manages structure. */
    OFFICER,
    /** Department user: reads what ACLs allow, raises file requests. */
    DEPT_USER;

    public String authority() {
        return "ROLE_" + name();
    }
}
