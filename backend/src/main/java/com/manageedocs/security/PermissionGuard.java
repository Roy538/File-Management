package com.manageedocs.security;

import org.springframework.security.access.AccessDeniedException;

import java.util.EnumSet;
import java.util.Set;

/**
 * The one rule behind every act of handing out access: nobody delegates what they do not
 * effectively hold themselves, and nobody delegates a platform-level capability.
 */
public final class PermissionGuard {

    private PermissionGuard() {
    }

    public static void assertCanDelegate(AppUserDetails caller, Set<Permission> permissions) {
        if (permissions.stream().anyMatch(Permission::isPlatformLevel)) {
            throw new IllegalArgumentException("Platform-level permissions cannot be granted to organisation users");
        }
        Set<Permission> missing = permissions.isEmpty() ? EnumSet.noneOf(Permission.class) : EnumSet.copyOf(permissions);
        missing.removeAll(caller.permissions());
        if (!missing.isEmpty()) {
            throw new AccessDeniedException("You cannot grant permissions you do not hold: " + missing);
        }
    }
}
