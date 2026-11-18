package com.manageedocs.identity.dto;

import com.manageedocs.identity.model.Role;
import com.manageedocs.identity.model.User;
import com.manageedocs.security.Permission;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

public final class UserDtos {

    private UserDtos() {
    }

    public record CreateUserRequest(
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(max = 100) String firstName,
            @NotBlank @Size(max = 100) String lastName,
            @NotNull Role role,
            UUID departmentId,
            @NotBlank @Size(min = 12, max = 72) String temporaryPassword) {
        @Override
        public String toString() {
            return "CreateUserRequest[email=" + email + ", role=" + role + ", temporaryPassword=***]";
        }
    }

    public record UpdateUserRequest(@NotNull Role role, boolean active) {
    }

    /** GRANT adds capabilities beyond the role; DENY removes role defaults. */
    public record PermissionOverridesRequest(Set<Permission> grant, Set<Permission> deny) {
    }

    public record UserView(UUID id, String email, String firstName, String lastName, Role role, UUID departmentId,
                           boolean active, Instant lastLoginAt, boolean locked) {
        public static UserView of(User u, Instant now) {
            return new UserView(u.getId(), u.getEmail(), u.getFirstName(), u.getLastName(), u.getRole(),
                    u.getDepartmentId(), u.isActive(), u.getLastLoginAt(), u.isLocked(now));
        }
    }
}
