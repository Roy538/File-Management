package com.manageedocs.identity.api;

import com.manageedocs.identity.domain.Role;
import com.manageedocs.identity.domain.User;
import com.manageedocs.tenancy.domain.Tenant;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

/** Public API contracts for authentication. Entities never leave the service layer. */
public final class AuthDtos {

    private AuthDtos() {
    }

    public record LoginRequest(
            @NotBlank @Size(max = 32) String organisation,
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(max = 200) String password
    ) {
        @Override
        public String toString() {
            return "LoginRequest[organisation=" + organisation + ", email=" + email + ", password=***]";
        }
    }

    public record TenantView(UUID id, String code, String name) {
        public static TenantView of(Tenant t) {
            return new TenantView(t.getId(), t.getCode(), t.getName());
        }
    }

    public record UserView(UUID id, String email, String firstName, String lastName, Role role,
                           UUID departmentId, TenantView organisation) {
        public static UserView of(User u, Tenant t) {
            return new UserView(u.getId(), u.getEmail(), u.getFirstName(), u.getLastName(), u.getRole(),
                    u.getDepartmentId(), TenantView.of(t));
        }
    }

    /** The refresh token is deliberately absent: it travels only in the HttpOnly cookie. */
    public record SessionResponse(String accessToken, Instant accessTokenExpiresAt, UserView user) {
    }
}
