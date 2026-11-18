package com.manageedocs.exception;

import com.manageedocs.audit.model.AuditOutcome;
import com.manageedocs.audit.service.AuditService;
import com.manageedocs.common.web.RequestInfo;
import com.manageedocs.security.CurrentUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Map;

/**
 * Records object-level access denials (directive scenario C). Runs from the exception handler,
 * i.e. after the request's own transaction has rolled back, in a fresh transaction, so a denial is
 * recorded even though the request failed and can never wait on the request's own locks.
 * Recording problems are logged, never turned into a different response.
 */
@Component
public class SecurityEventRecorder {

    private static final Logger log = LoggerFactory.getLogger(SecurityEventRecorder.class);

    private final AuditService audit;
    private final TransactionTemplate tx;

    public SecurityEventRecorder(AuditService audit, TransactionTemplate tx) {
        this.audit = audit;
        this.tx = tx;
    }

    public void accessDenied(ApiException ex) {
        CurrentUser.find().ifPresent(caller -> {
            try {
                tx.executeWithoutResult(s -> audit.record(
                        new AuditService.Actor(caller.userId(), caller.email(), RequestInfo.clientIp()),
                        "ACCESS_DENIED", AuditOutcome.DENIED, ex.deniedResourceType(), ex.deniedResourceId(),
                        Map.of("status", Integer.toString(ex.status().value()), "code", ex.code())));
            } catch (RuntimeException e) {
                log.warn("Could not record access-denied event: {}", e.getClass().getSimpleName());
            }
        });
    }
}
