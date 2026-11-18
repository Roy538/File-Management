package com.manageedocs.security;

import com.manageedocs.identity.model.Role;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

import static com.manageedocs.security.Permission.*;

/**
 * Baseline capabilities per role. Individual users can be granted extra capabilities or have
 * defaults denied ({@code user_permission}); effective = defaults ∪ grants − denies.
 */
public final class RoleDefaults {

    private static final Map<Role, Set<Permission>> DEFAULTS = Map.of(
            Role.SUPER_ADMIN, EnumSet.allOf(Permission.class),
            Role.ADMIN, tenantLevel(),
            Role.OFFICER, EnumSet.of(
                    TENANT_USERS_VIEW,
                    CABINETS_VIEW, CABINETS_MANAGE,
                    DOCUMENTS_VIEW, DOCUMENTS_DOWNLOAD, DOCUMENTS_UPLOAD, DOCUMENTS_EDIT),
            Role.DEPT_USER, EnumSet.of(
                    CABINETS_VIEW,
                    DOCUMENTS_VIEW, DOCUMENTS_DOWNLOAD)
    );

    private RoleDefaults() {
    }

    public static Set<Permission> forRole(Role role) {
        return EnumSet.copyOf(DEFAULTS.get(role));
    }

    /** Everything an organisation administrator may hold: all non-platform capabilities. */
    public static Set<Permission> tenantLevel() {
        EnumSet<Permission> set = EnumSet.noneOf(Permission.class);
        Arrays.stream(Permission.values()).filter(p -> !p.isPlatformLevel()).forEach(set::add);
        return set;
    }
}
