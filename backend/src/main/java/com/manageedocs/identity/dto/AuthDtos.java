package com.manageedocs.identity.dto;

import com.manageedocs.identity.model.Role;
import com.manageedocs.security.AppUserDetails;
import com.manageedocs.security.Permission;
import com.manageedocs.tenancy.model.Tenant;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
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

    /**
     * The caller as the UI needs it. {@code permissions} are capability codes ("documents:upload")
     * for hiding what the user cannot use — the server still enforces every one of them.
     */
    public record UserProfile(UUID id, String email, String fullName, Role role, TenantView organisation,
                              List<String> permissions) {
        public static UserProfile of(AppUserDetails c, Tenant t) {
            return new UserProfile(c.userId(), c.email(), c.fullName(), c.role(), TenantView.of(t),
                    c.permissions().stream().map(Permission::getCode).sorted().toList());
        }
    }

    /** The refresh token is deliberately absent: it travels only in the HttpOnly cookie. */
    public record SessionResponse(String accessToken, Instant accessTokenExpiresAt, UserProfile user) {
    }
}
