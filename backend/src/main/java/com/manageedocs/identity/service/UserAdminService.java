package com.manageedocs.identity.service;

import com.manageedocs.audit.service.AuditService;
import com.manageedocs.common.dto.PagedResponse;
import com.manageedocs.exception.ApiException;
import com.manageedocs.identity.dto.UserDtos.CreateUserRequest;
import com.manageedocs.identity.dto.UserDtos.PermissionOverridesRequest;
import com.manageedocs.identity.dto.UserDtos.UpdateUserRequest;
import com.manageedocs.identity.dto.UserDtos.UserView;
import com.manageedocs.identity.model.Role;
import com.manageedocs.identity.model.User;
import com.manageedocs.identity.model.UserPermission;
import com.manageedocs.identity.repository.RefreshTokenRepository;
import com.manageedocs.identity.repository.UserPermissionRepository;
import com.manageedocs.identity.repository.UserRepository;
import com.manageedocs.security.AppUserDetails;
import com.manageedocs.security.Permission;
import com.manageedocs.security.PermissionGuard;
import com.manageedocs.tenancy.service.PasswordPolicy;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Organisation user administration. All lookups are tenant-scoped; nobody can reach another organisation's users. */
@Service
public class UserAdminService {

    private final UserRepository users;
    private final UserPermissionRepository overrides;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder passwordEncoder;
    private final AuditService audit;
    private final Clock clock;

    public UserAdminService(UserRepository users, UserPermissionRepository overrides, RefreshTokenRepository refreshTokens,
                            PasswordEncoder passwordEncoder, AuditService audit, Clock clock) {
        this.users = users;
        this.overrides = overrides;
        this.refreshTokens = refreshTokens;
        this.passwordEncoder = passwordEncoder;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public PagedResponse<UserView> list(int page, int size) {
        return PagedResponse.of(users.findAll(PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100),
                Sort.by("lastName", "firstName"))), u -> UserView.of(u, clock.instant()));
    }

    @Transactional
    public UserView create(AppUserDetails caller, CreateUserRequest req) {
        guardRole(caller, req.role());
        PasswordPolicy.validate(req.temporaryPassword());
        if (users.findByEmail(User.normalizeEmail(req.email())).isPresent()) {
            throw ApiException.conflict("USER_EXISTS", "A user with this email already exists in your organisation");
        }
        User u = users.save(new User(req.email(), passwordEncoder.encode(req.temporaryPassword()), req.firstName(),
                req.lastName(), req.role(), req.departmentId()));
        audit.success(caller, "USER_CREATED", "USER", u.getId(), Map.of("email", u.getEmail(), "role", u.getRole().name()));
        return UserView.of(u, clock.instant());
    }

    @Transactional
    public UserView update(AppUserDetails caller, UUID id, UpdateUserRequest req) {
        User u = users.findById(id).orElseThrow(() -> ApiException.notFound("User"));
        if (u.getId().equals(caller.userId()) && (!req.active() || req.role() != u.getRole())) {
            throw ApiException.conflict("SELF_CHANGE", "You cannot change your own role or deactivate yourself");
        }
        guardRole(caller, req.role());
        guardRole(caller, u.getRole());
        Role before = u.getRole();
        boolean wasActive = u.isActive();
        u.changeRole(req.role());
        u.setActive(req.active());
        if (!req.active()) refreshTokens.revokeAllForUser(u.getId(), clock.instant());
        audit.success(caller, "USER_UPDATED", "USER", id, Map.of(
                "role", before + "->" + u.getRole(), "active", wasActive + "->" + u.isActive()));
        return UserView.of(u, clock.instant());
    }

    @Transactional(readOnly = true)
    public com.manageedocs.identity.dto.UserDtos.PermissionOverridesView overrides(UUID id) {
        users.findById(id).orElseThrow(() -> ApiException.notFound("User"));
        var all = overrides.findForUser(id);
        return new com.manageedocs.identity.dto.UserDtos.PermissionOverridesView(
                all.stream().filter(o -> o.getEffect() == UserPermission.Effect.GRANT).map(o -> o.getPermission().name()).sorted().toList(),
                all.stream().filter(o -> o.getEffect() == UserPermission.Effect.DENY).map(o -> o.getPermission().name()).sorted().toList());
    }

    /** Replaces the user's overrides. The caller can only grant capabilities they hold themselves. */
    @Transactional
    public void setOverrides(AppUserDetails caller, UUID id, PermissionOverridesRequest req) {
        User u = users.findById(id).orElseThrow(() -> ApiException.notFound("User"));
        Set<Permission> grant = req.grant() == null ? EnumSet.noneOf(Permission.class) : EnumSet.copyOf(req.grant());
        Set<Permission> deny = req.deny() == null ? EnumSet.noneOf(Permission.class) : EnumSet.copyOf(req.deny());
        if (grant.stream().anyMatch(deny::contains)) throw new IllegalArgumentException("A permission cannot be both granted and denied");
        PermissionGuard.assertCanDelegate(caller, grant);
        PermissionGuard.assertCanDelegate(caller, deny);
        overrides.deleteAll(overrides.findForUser(id));
        overrides.flush();
        grant.forEach(p -> overrides.save(new UserPermission(id, p, UserPermission.Effect.GRANT, caller.userId())));
        deny.forEach(p -> overrides.save(new UserPermission(id, p, UserPermission.Effect.DENY, caller.userId())));
        u.revokeAllTokens();
        audit.success(caller, "USER_PERMISSIONS_CHANGED", "USER", id, Map.of("grant", grant.toString(), "deny", deny.toString()));
    }

    /** Only platform staff may create or manage platform roles; admins manage everyone else in their organisation. */
    private static void guardRole(AppUserDetails caller, Role target) {
        if (target == Role.SUPER_ADMIN && caller.role() != Role.SUPER_ADMIN) {
            throw ApiException.forbidden("Only platform administrators can assign this role");
        }
    }
}
