package com.manageedocs.retention.service;

import com.manageedocs.retention.dto.RetentionDtos.EvaluationResult;
import com.manageedocs.tenancy.TenantContext;
import com.manageedocs.tenancy.model.Tenant;
import com.manageedocs.tenancy.repository.TenantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Daily retention evaluation for every active organisation. No caller exists here: each tenant is
 * pinned explicitly, and failures in one organisation never stop the others.
 */
@Component
public class RetentionScheduler {

    private static final Logger log = LoggerFactory.getLogger(RetentionScheduler.class);

    private final TenantRepository tenants;
    private final DispositionService disposition;
    private final boolean enabled;

    public RetentionScheduler(TenantRepository tenants, DispositionService disposition,
                              @Value("${manageedocs.retention.scheduler-enabled:true}") boolean enabled) {
        this.tenants = tenants;
        this.disposition = disposition;
        this.enabled = enabled;
    }

    @Scheduled(cron = "${manageedocs.retention.cron:0 0 2 * * *}")
    void daily() {
        if (!enabled) return;
        for (Tenant t : tenants.findAll()) {
            if (!t.isActive()) continue;
            try {
                EvaluationResult r = TenantContext.callAs(t.getId(), () -> disposition.evaluate(null));
                if (r.archived() + r.proposedForDestruction() > 0) {
                    log.info("Retention for {}: archived {}, proposed {} for destruction, {} held",
                            t.getCode(), r.archived(), r.proposedForDestruction(), r.skippedUnderHold());
                }
            } catch (RuntimeException e) {
                log.error("Retention evaluation failed for organisation {}", t.getCode(), e);
            }
        }
    }
}
