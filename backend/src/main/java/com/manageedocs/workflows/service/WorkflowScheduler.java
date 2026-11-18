package com.manageedocs.workflows.service;

import com.manageedocs.tenancy.TenantContext;
import com.manageedocs.tenancy.model.Tenant;
import com.manageedocs.tenancy.repository.TenantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Hourly deadline sweep per organisation; one organisation's failure never stops the others. */
@Component
public class WorkflowScheduler {

    private static final Logger log = LoggerFactory.getLogger(WorkflowScheduler.class);

    private final TenantRepository tenants;
    private final WorkflowEngine engine;
    private final boolean enabled;

    public WorkflowScheduler(TenantRepository tenants, WorkflowEngine engine,
                             @Value("${manageedocs.workflows.scheduler-enabled:true}") boolean enabled) {
        this.tenants = tenants;
        this.engine = engine;
        this.enabled = enabled;
    }

    @Scheduled(cron = "${manageedocs.workflows.escalation-cron:0 5 * * * *}")
    void escalate() {
        if (!enabled) return;
        for (Tenant t : tenants.findAll()) {
            if (!t.isActive()) continue;
            try {
                int n = TenantContext.callAs(t.getId(), engine::escalateOverdue);
                if (n > 0) log.info("Escalated {} overdue review task(s) for {}", n, t.getCode());
            } catch (RuntimeException e) {
                log.error("Escalation failed for organisation {}", t.getCode(), e);
            }
        }
    }
}
