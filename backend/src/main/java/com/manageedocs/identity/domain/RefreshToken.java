package com.manageedocs.identity.domain;

import com.manageedocs.common.persistence.Ids;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * Opaque refresh token record; only its SHA-256 hash is stored. Deliberately NOT a
 * {@code @TenantId} entity: refresh happens before a principal exists, so lookup is by hash,
 * and the tenant is then taken from this row (server-controlled), never from the client.
 */
@Entity
@Table(name = "refresh_token")
public class RefreshToken {

    @Id
    private UUID id = Ids.newId();

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "family_id", nullable = false, updatable = false)
    private UUID familyId;

    @Column(name = "token_hash", nullable = false, length = 64, updatable = false)
    private String tokenHash;

    @Column(name = "issued_at", nullable = false, updatable = false)
    private Instant issuedAt;

    @Column(name = "expires_at", nullable = false, updatable = false)
    private Instant expiresAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "replaced_by")
    private UUID replacedBy;

    @Column(name = "user_agent", length = 255)
    private String userAgent;

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    protected RefreshToken() {
    }

    public RefreshToken(UUID tenantId, UUID userId, UUID familyId, String tokenHash,
                        Instant issuedAt, Instant expiresAt, String userAgent, String ipAddress) {
        this.tenantId = tenantId;
        this.userId = userId;
        this.familyId = familyId;
        this.tokenHash = tokenHash;
        this.issuedAt = issuedAt;
        this.expiresAt = expiresAt;
        this.userAgent = userAgent == null ? null : userAgent.substring(0, Math.min(255, userAgent.length()));
        this.ipAddress = ipAddress;
    }

    public boolean isUsable(Instant now) {
        return revokedAt == null && expiresAt.isAfter(now);
    }

    /** A token that was rotated (has a successor) being presented again signals theft. */
    public boolean wasRotated() {
        return replacedBy != null;
    }

    public void rotateTo(UUID successorId, Instant now) {
        this.replacedBy = successorId;
        this.revokedAt = now;
    }

    public void revoke(Instant now) {
        if (revokedAt == null) {
            revokedAt = now;
        }
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getFamilyId() {
        return familyId;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }
}
