package com.manageedocs.security;

import com.manageedocs.identity.model.Role;

import java.util.Set;
import java.util.UUID;

/**
 * The authenticated caller, rebuilt from the database on every request (user and organisation
 * still active, token version current), so controllers and services never re-fetch the user
 * just to learn who is calling and what they may do. Services take this object, never raw ids.
 */
public record AppUserDetails(
        UUID userId,
        UUID tenantId,
        String email,
        String fullName,
        Role role,
        Set<Permission> permissions
) {
    public boolean has(Permission permission) {
        return permissions.contains(permission);
    }

    public boolean isAdmin() {
        return role == Role.ADMIN || role == Role.SUPER_ADMIN;
    }
}
