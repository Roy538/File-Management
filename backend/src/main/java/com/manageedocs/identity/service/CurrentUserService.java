package com.manageedocs.identity.service;

import com.manageedocs.exception.ApiException;
import com.manageedocs.identity.dto.AuthDtos.UserProfile;
import com.manageedocs.security.AppUserDetails;
import com.manageedocs.tenancy.repository.TenantRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CurrentUserService {

    private final TenantRepository tenants;

    public CurrentUserService(TenantRepository tenants) {
        this.tenants = tenants;
    }

    @Transactional(readOnly = true)
    public UserProfile profile(AppUserDetails caller) {
        return tenants.findById(caller.tenantId())
                .map(t -> UserProfile.of(caller, t))
                .orElseThrow(() -> ApiException.unauthorized("Not authenticated"));
    }
}
