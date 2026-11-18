package com.manageedocs.identity.application;

import com.manageedocs.common.error.ApiException;
import com.manageedocs.identity.api.AuthDtos.UserView;
import com.manageedocs.identity.domain.User;
import com.manageedocs.identity.domain.UserRepository;
import com.manageedocs.tenancy.TenantContext;
import com.manageedocs.tenancy.domain.Tenant;
import com.manageedocs.tenancy.domain.TenantRepository;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class CurrentUserService {

    private final UserRepository users;
    private final TenantRepository tenants;

    public CurrentUserService(UserRepository users, TenantRepository tenants) {
        this.users = users;
        this.tenants = tenants;
    }

    public static UUID currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getName() == null) {
            throw ApiException.unauthorized("Not authenticated");
        }
        return UUID.fromString(auth.getName());
    }

    /** Loads the caller; a deactivated or deleted user with a still-valid token is rejected. */
    @Transactional(readOnly = true)
    public User require() {
        return users.findById(currentUserId())
                .filter(User::isActive)
                .orElseThrow(() -> ApiException.unauthorized("Not authenticated"));
    }

    @Transactional(readOnly = true)
    public UserView view() {
        User u = require();
        Tenant t = tenants.findById(TenantContext.require()).orElseThrow(() -> ApiException.unauthorized("Not authenticated"));
        return UserView.of(u, t);
    }
}
