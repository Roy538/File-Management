package com.manageedocs.identity.application;

import com.manageedocs.audit.application.AuditService;
import com.manageedocs.audit.application.AuditService.Actor;
import com.manageedocs.audit.domain.AuditOutcome;
import com.manageedocs.common.error.ApiException;
import com.manageedocs.common.persistence.Ids;
import com.manageedocs.config.SecurityProperties;
import com.manageedocs.identity.domain.RefreshToken;
import com.manageedocs.identity.domain.RefreshTokenRepository;
import com.manageedocs.identity.domain.User;
import com.manageedocs.identity.domain.UserRepository;
import com.manageedocs.tenancy.TenantContext;
import com.manageedocs.tenancy.domain.Tenant;
import com.manageedocs.tenancy.domain.TenantRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Login, refresh-token rotation and logout (ADR-005).
 * Transactions are opened inside {@link TenantContext#callAs} so Hibernate binds the right tenant.
 * Failure paths commit their side effects (lockout counter, audit) and only then raise 401.
 */
@Service
public class AuthService {

    /** Same message for unknown tenant, unknown user, bad password and lockout: no account enumeration. */
    static final String INVALID_CREDENTIALS = "Invalid organisation, email or password";

    private final TenantRepository tenants;
    private final UserRepository users;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokens;
    private final AuditService audit;
    private final SecurityProperties props;
    private final TransactionTemplate tx;
    private final Clock clock;
    /** Real BCrypt hash (same cost) so unknown-user logins take as long as real ones. */
    private final String timingDummyHash;

    public AuthService(TenantRepository tenants, UserRepository users, RefreshTokenRepository refreshTokens,
                       PasswordEncoder passwordEncoder, TokenService tokens, AuditService audit,
                       SecurityProperties props, TransactionTemplate tx, Clock clock) {
        this.tenants = tenants;
        this.users = users;
        this.refreshTokens = refreshTokens;
        this.passwordEncoder = passwordEncoder;
        this.tokens = tokens;
        this.audit = audit;
        this.props = props;
        this.tx = tx;
        this.clock = clock;
        this.timingDummyHash = passwordEncoder.encode(tokens.newOpaqueToken());
    }

    public record Session(User user, Tenant tenant, TokenService.AccessToken accessToken,
                          String refreshToken, UUID refreshTokenId, Instant refreshExpiresAt) {
    }

    private record Outcome(Session session, boolean ok) {
    }

    public Session login(String tenantCode, String email, String password, String ip, String userAgent) {
        Optional<Tenant> tenant = tenants.findByCodeIgnoreCaseAndActiveTrue(tenantCode.trim());
        if (tenant.isEmpty()) {
            passwordEncoder.matches(password, timingDummyHash);
            throw ApiException.unauthorized(INVALID_CREDENTIALS);
        }
        Tenant t = tenant.get();
        Outcome outcome = TenantContext.callAs(t.getId(), () -> tx.execute(status -> {
            Instant now = clock.instant();
            String normalized = User.normalizeEmail(email);
            Optional<User> found = users.findByEmail(normalized);
            if (found.isEmpty()) {
                passwordEncoder.matches(password, timingDummyHash);
                audit.record(Actor.anonymous(normalized, ip), "LOGIN", AuditOutcome.FAILURE, "USER", null,
                        Map.of("reason", "UNKNOWN_USER"));
                return new Outcome(null, false);
            }
            User user = found.get();
            if (!user.canLogIn(now)) {
                // Do not even check the password for locked/inactive accounts.
                audit.record(new Actor(user.getId(), user.getEmail(), ip), "LOGIN", AuditOutcome.DENIED, "USER",
                        user.getId().toString(), Map.of("reason", user.isLocked(now) ? "LOCKED" : "INACTIVE"));
                return new Outcome(null, false);
            }
            if (!passwordEncoder.matches(password, user.getPasswordHash())) {
                user.recordFailedLogin(now, props.maxFailedLogins(), props.lockoutDuration());
                audit.record(new Actor(user.getId(), user.getEmail(), ip), "LOGIN", AuditOutcome.FAILURE, "USER",
                        user.getId().toString(), Map.of("reason", "BAD_PASSWORD",
                                "locked", Boolean.toString(user.isLocked(now))));
                return new Outcome(null, false);
            }
            user.recordSuccessfulLogin(now);
            Session session = openSession(user, t, Ids.newId(), now, ip, userAgent);
            audit.record(new Actor(user.getId(), user.getEmail(), ip), "LOGIN", AuditOutcome.SUCCESS, "USER",
                    user.getId().toString(), null);
            return new Outcome(session, true);
        }));
        if (outcome == null || !outcome.ok()) {
            throw ApiException.unauthorized(INVALID_CREDENTIALS);
        }
        return outcome.session();
    }

    /**
     * Rotates a refresh token. Presenting a token that was already rotated means it was copied:
     * the whole family is revoked and the caller must log in again.
     */
    public Session refresh(String presentedToken, String ip, String userAgent) {
        if (presentedToken == null || presentedToken.isBlank()) {
            throw ApiException.unauthorized("Session expired");
        }
        String hash = tokens.hash(presentedToken);
        // Step 1 (no tenant yet): find + lock the token row; tenant is taken from that server-side row.
        UUID tenantId = tx.execute(s -> refreshTokens.findByHashForUpdate(hash).map(RefreshToken::getTenantId).orElse(null));
        if (tenantId == null) {
            throw ApiException.unauthorized("Session expired");
        }
        Outcome outcome = TenantContext.callAs(tenantId, () -> tx.execute(status -> {
            Instant now = clock.instant();
            RefreshToken current = refreshTokens.findByHashForUpdate(hash).orElse(null);
            if (current == null) {
                return new Outcome(null, false);
            }
            if (current.wasRotated()) {
                refreshTokens.revokeFamily(current.getFamilyId(), now);
                audit.record(new Actor(current.getUserId(), null, ip), "REFRESH_TOKEN_REUSE", AuditOutcome.DENIED,
                        "USER", current.getUserId().toString(), Map.of("family", current.getFamilyId().toString()));
                return new Outcome(null, false);
            }
            if (!current.isUsable(now)) {
                return new Outcome(null, false);
            }
            User user = users.findById(current.getUserId()).orElse(null);
            Tenant tenant = tenants.findById(tenantId).filter(Tenant::isActive).orElse(null);
            if (user == null || tenant == null || !user.canLogIn(now)) {
                current.revoke(now);
                return new Outcome(null, false);
            }
            Session session = openSession(user, tenant, current.getFamilyId(), now, ip, userAgent);
            current.rotateTo(session.refreshTokenId(), now);
            return new Outcome(session, true);
        }));
        if (outcome == null || !outcome.ok()) {
            throw ApiException.unauthorized("Session expired");
        }
        return outcome.session();
    }

    public void logout(String presentedToken, String ip) {
        if (presentedToken == null || presentedToken.isBlank()) {
            return;
        }
        String hash = tokens.hash(presentedToken);
        UUID tenantId = tx.execute(s -> refreshTokens.findByHashForUpdate(hash).map(RefreshToken::getTenantId).orElse(null));
        if (tenantId == null) {
            return;
        }
        TenantContext.runAs(tenantId, () -> tx.executeWithoutResult(status -> refreshTokens.findByHashForUpdate(hash)
                .ifPresent(t -> {
                    Instant now = clock.instant();
                    refreshTokens.revokeFamily(t.getFamilyId(), now);
                    audit.record(new Actor(t.getUserId(), null, ip), "LOGOUT", AuditOutcome.SUCCESS, "USER",
                            t.getUserId().toString(), null);
                })));
    }

    private Session openSession(User user, Tenant tenant, UUID familyId, Instant now, String ip, String userAgent) {
        String opaque = tokens.newOpaqueToken();
        Instant refreshExp = now.plus(props.refreshTokenTtl());
        RefreshToken saved = refreshTokens.save(new RefreshToken(user.getTenantId(), user.getId(), familyId,
                tokens.hash(opaque), now, refreshExp, userAgent, ip));
        return new Session(user, tenant, tokens.issueAccessToken(user, now), opaque, saved.getId(), refreshExp);
    }
}
