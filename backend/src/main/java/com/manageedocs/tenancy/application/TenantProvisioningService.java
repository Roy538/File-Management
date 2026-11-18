package com.manageedocs.tenancy.application;

import com.manageedocs.audit.application.AuditService;
import com.manageedocs.audit.application.AuditService.Actor;
import com.manageedocs.audit.domain.AuditChainHead;
import com.manageedocs.audit.domain.AuditOutcome;
import com.manageedocs.audit.domain.AuditChainHeadRepository;
import com.manageedocs.common.error.ApiException;
import com.manageedocs.identity.domain.Role;
import com.manageedocs.identity.domain.User;
import com.manageedocs.identity.domain.UserRepository;
import com.manageedocs.tenancy.TenantContext;
import com.manageedocs.tenancy.domain.Tenant;
import com.manageedocs.tenancy.domain.TenantRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Map;

/** Creates an organisation with its audit chain head and first administrator, atomically. */
@Service
public class TenantProvisioningService {

    private final TenantRepository tenants;
    private final UserRepository users;
    private final AuditChainHeadRepository heads;
    private final AuditService audit;
    private final PasswordEncoder passwordEncoder;
    private final TransactionTemplate tx;

    public TenantProvisioningService(TenantRepository tenants, UserRepository users, AuditChainHeadRepository heads,
                                     AuditService audit, PasswordEncoder passwordEncoder, TransactionTemplate tx) {
        this.tenants = tenants;
        this.users = users;
        this.heads = heads;
        this.audit = audit;
        this.passwordEncoder = passwordEncoder;
        this.tx = tx;
    }

    public record AdminSpec(String email, String rawPassword, String firstName, String lastName) {
        @Override
        public String toString() {
            return "AdminSpec[email=" + email + ", password=***]";
        }
    }

    public Tenant provision(String code, String name, AdminSpec admin) {
        PasswordPolicy.validate(admin.rawPassword());
        if (tenants.findByCodeIgnoreCaseAndActiveTrue(code).isPresent()) {
            throw ApiException.conflict("TENANT_EXISTS", "An organisation with this code already exists");
        }
        Tenant tenant = tx.execute(s -> tenants.saveAndFlush(new Tenant(code, name)));
        return TenantContext.callAs(tenant.getId(), () -> tx.execute(s -> {
            heads.save(new AuditChainHead(tenant.getId()));
            User u = users.save(new User(admin.email(), passwordEncoder.encode(admin.rawPassword()),
                    admin.firstName(), admin.lastName(), Role.ADMIN, null));
            audit.record(Actor.anonymous("system", null), "TENANT_PROVISIONED", AuditOutcome.SUCCESS,
                    "TENANT", tenant.getId().toString(), Map.of("code", tenant.getCode(), "adminUserId", u.getId().toString()));
            return tenant;
        }));
    }
}
