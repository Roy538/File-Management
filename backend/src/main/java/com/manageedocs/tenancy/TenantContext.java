package com.manageedocs.tenancy;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Callable;

/**
 * Where the current tenant comes from, in priority order:
 * <ol>
 *   <li>An explicit, code-controlled override ({@link #callAs}) — used by login, token refresh,
 *       and background jobs that know which tenant they are processing.</li>
 *   <li>The {@code tid} claim of the authenticated JWT.</li>
 * </ol>
 * Request parameters, headers and bodies are never consulted (ADR-004).
 */
public final class TenantContext {

    public static final String TENANT_CLAIM = "tid";
    /** Matches no rows; used when no tenant is established so queries fail closed. */
    public static final UUID NO_TENANT = new UUID(0L, 0L);

    private static final ThreadLocal<UUID> OVERRIDE = new ThreadLocal<>();

    private TenantContext() {
    }

    public static Optional<UUID> current() {
        UUID override = OVERRIDE.get();
        if (override != null) {
            return Optional.of(override);
        }
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof Jwt jwt) {
            String tid = jwt.getClaimAsString(TENANT_CLAIM);
            if (tid != null) {
                return Optional.of(UUID.fromString(tid));
            }
        }
        return Optional.empty();
    }

    public static UUID require() {
        return current().orElseThrow(() -> new IllegalStateException("No tenant in context"));
    }

    /** Runs {@code work} with the tenant pinned. Must wrap the transaction, not run inside it. */
    public static <T> T callAs(UUID tenantId, Callable<T> work) {
        UUID previous = OVERRIDE.get();
        OVERRIDE.set(tenantId);
        try {
            return work.call();
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        } finally {
            if (previous == null) {
                OVERRIDE.remove();
            } else {
                OVERRIDE.set(previous);
            }
        }
    }

    public static void runAs(UUID tenantId, Runnable work) {
        callAs(tenantId, () -> {
            work.run();
            return null;
        });
    }
}
