package com.manageedocs.tenancy.application;

import com.manageedocs.tenancy.domain.TenantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Local development only ({@code dev} profile): creates organisation {@code MC} with an admin so
 * the app is usable after a fresh migrate. Never active in other profiles; idempotent.
 */
@Component
@Profile("dev")
public class DevDataSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DevDataSeeder.class);

    private final TenantRepository tenants;
    private final TenantProvisioningService provisioning;
    private final String adminEmail;
    private final String adminPassword;

    public DevDataSeeder(TenantRepository tenants, TenantProvisioningService provisioning,
                         @Value("${DEV_ADMIN_EMAIL:admin@manageedocs.local}") String adminEmail,
                         @Value("${DEV_ADMIN_PASSWORD:ChangeMe-Dev-2026!}") String adminPassword) {
        this.tenants = tenants;
        this.provisioning = provisioning;
        this.adminEmail = adminEmail;
        this.adminPassword = adminPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (tenants.findByCodeIgnoreCaseAndActiveTrue("MC").isPresent()) {
            return;
        }
        provisioning.provision("MC", "MyCredit Limited",
                new TenantProvisioningService.AdminSpec(adminEmail, adminPassword, "System", "Administrator"));
        log.info("Dev seed: organisation MC created with admin {}", adminEmail);
    }
}
