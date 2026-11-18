package com.manageedocs.records.service;

import com.manageedocs.tenancy.TenantContext;
import com.manageedocs.tenancy.model.Tenant;
import com.manageedocs.tenancy.repository.TenantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Morning overdue-file reminders for every active organisation; one failing organisation never stops the rest. */
@Component
public class RecordsScheduler {

    private static final Logger log = LoggerFactory.getLogger(RecordsScheduler.class);

    private final TenantRepository tenants;
    private final OverdueLoanService overdue;
    private final boolean enabled;

    public RecordsScheduler(TenantRepository tenants, OverdueLoanService overdue,
                            @Value("${manageedocs.records.overdue-check-enabled:true}") boolean enabled) {
        this.tenants = tenants;
        this.overdue = overdue;
        this.enabled = enabled;
    }

    @Scheduled(cron = "${manageedocs.records.overdue-cron:0 0 8 * * *}", zone = "${manageedocs.records.time-zone:Africa/Nairobi}")
    void daily() {
        if (!enabled) return;
        for (Tenant t : tenants.findAll()) {
            if (!t.isActive()) continue;
            try {
                int sent = TenantContext.callAs(t.getId(), overdue::notifyOverdue);
                if (sent > 0) log.info("Overdue file reminders for {}: {}", t.getCode(), sent);
            } catch (RuntimeException e) {
                log.error("Overdue file check failed for organisation {}", t.getCode(), e);
            }
        }
    }
}
