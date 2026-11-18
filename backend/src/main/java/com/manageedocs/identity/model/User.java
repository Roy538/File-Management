package com.manageedocs.identity.model;

import com.manageedocs.common.persistence.TenantScopedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

@Entity
@Table(name = "app_user")
public class User extends TenantScopedEntity {

    @Column(name = "department_id")
    private UUID departmentId;

    @Column(nullable = false, length = 254)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    @Column(name = "first_name", nullable = false, length = 100)
    private String firstName;

    @Column(name = "last_name", nullable = false, length = 100)
    private String lastName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Role role;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "failed_login_count", nullable = false)
    private int failedLoginCount;

    @Column(name = "locked_until")
    private Instant lockedUntil;

    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    @Column(name = "password_changed_at")
    private Instant passwordChangedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "token_version", nullable = false)
    private int tokenVersion;

    protected User() {
    }

    public User(String email, String passwordHash, String firstName, String lastName, Role role, UUID departmentId) {
        this.email = normalizeEmail(email);
        this.passwordHash = passwordHash;
        this.firstName = firstName.trim();
        this.lastName = lastName.trim();
        this.role = role;
        this.departmentId = departmentId;
        this.passwordChangedAt = Instant.now();
    }

    public static String normalizeEmail(String email) {
        return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    public boolean canLogIn(Instant now) {
        return active && deletedAt == null && !isLocked(now);
    }

    public boolean isLocked(Instant now) {
        return lockedUntil != null && lockedUntil.isAfter(now);
    }

    /** Records a failed attempt; locks the account once {@code maxFailures} is reached. */
    public void recordFailedLogin(Instant now, int maxFailures, Duration lockout) {
        failedLoginCount++;
        if (failedLoginCount >= maxFailures) {
            lockedUntil = now.plus(lockout);
            failedLoginCount = 0;
        }
    }

    public void recordSuccessfulLogin(Instant now) {
        failedLoginCount = 0;
        lockedUntil = null;
        lastLoginAt = now;
    }

    /** Role change takes effect immediately: existing tokens are revoked. */
    public void changeRole(Role newRole) {
        if (newRole != role) {
            role = newRole;
            revokeAllTokens();
        }
    }

    public void setActive(boolean newActive) {
        if (newActive != active) {
            active = newActive;
            revokeAllTokens();
        }
    }

    /** Invalidates every access token issued so far (they carry the old version). */
    public void revokeAllTokens() {
        tokenVersion++;
    }

    public int getTokenVersion() {
        return tokenVersion;
    }

    public UUID getDepartmentId() {
        return departmentId;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getFirstName() {
        return firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public String getFullName() {
        return firstName + " " + lastName;
    }

    public Role getRole() {
        return role;
    }

    public boolean isActive() {
        return active;
    }

    public int getFailedLoginCount() {
        return failedLoginCount;
    }

    public Instant getLockedUntil() {
        return lockedUntil;
    }

    public Instant getLastLoginAt() {
        return lastLoginAt;
    }
}
