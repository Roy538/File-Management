package com.manageedocs.security;

import com.manageedocs.identity.model.User;
import com.manageedocs.identity.model.UserPermission;
import com.manageedocs.identity.repository.UserPermissionRepository;
import com.manageedocs.identity.repository.UserRepository;
import com.manageedocs.tenancy.TenantContext;
import com.manageedocs.tenancy.model.Tenant;
import com.manageedocs.tenancy.repository.TenantRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Builds the caller from the database. Returns empty — and the request is rejected with 401 —
 * when the user is gone, deactivated or locked, the organisation is disabled, or the token was
 * issued before the user's current token version (password/role change, forced logout).
 */
@Component
public class AppUserDetailsLoader {

    private final UserRepository users;
    private final TenantRepository tenants;
    private final UserPermissionRepository overrides;
    private final TransactionTemplate tx;
    private final Clock clock;

    public AppUserDetailsLoader(UserRepository users, TenantRepository tenants, UserPermissionRepository overrides,
                                TransactionTemplate tx, Clock clock) {
        this.users = users;
        this.tenants = tenants;
        this.overrides = overrides;
        this.tx = tx;
        this.clock = clock;
    }

    public Optional<AppUserDetails> load(UUID tenantId, UUID userId, int tokenVersion) {
        return TenantContext.callAs(tenantId, () -> tx.execute(s -> {
            Optional<Tenant> tenant = tenants.findById(tenantId).filter(Tenant::isActive);
            Optional<User> user = users.findById(userId)
                    .filter(u -> u.canLogIn(clock.instant()))
                    .filter(u -> u.getTokenVersion() == tokenVersion);
            if (tenant.isEmpty() || user.isEmpty()) {
                return Optional.<AppUserDetails>empty();
            }
            return Optional.of(build(user.get()));
        }));
    }

    /** Effective capabilities = role defaults ∪ grants − denies. Must run inside the user's tenant. */
    public AppUserDetails build(User u) {
        Set<Permission> effective = RoleDefaults.forRole(u.getRole());
        for (UserPermission o : overrides.findForUser(u.getId())) {
            if (o.getEffect() == UserPermission.Effect.GRANT) effective.add(o.getPermission());
            else effective.remove(o.getPermission());
        }
        return new AppUserDetails(u.getId(), u.getTenantId(), u.getEmail(), u.getFullName(), u.getRole(),
                Set.copyOf(effective));
    }
}
