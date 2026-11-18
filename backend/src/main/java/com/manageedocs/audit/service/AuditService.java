package com.manageedocs.audit.service;

import com.manageedocs.audit.model.AuditChainHead;
import com.manageedocs.audit.model.AuditEvent;
import com.manageedocs.audit.model.AuditEventFactory;
import com.manageedocs.audit.model.AuditHasher;
import com.manageedocs.audit.model.AuditOutcome;
import com.manageedocs.audit.repository.AuditChainHeadRepository;
import com.manageedocs.audit.repository.AuditEventRepository;
import com.manageedocs.common.web.CorrelationIdFilter;
import com.manageedocs.tenancy.TenantContext;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Writes audit events inside the caller's transaction, so an event exists if and only if the
 * audited change committed. Appends serialise per tenant on the chain-head row lock.
 */
@Service
public class AuditService {

    private final AuditEventRepository events;
    private final AuditChainHeadRepository heads;

    public AuditService(AuditEventRepository events, AuditChainHeadRepository heads) {
        this.events = events;
        this.heads = heads;
    }

    public record Actor(UUID id, String label, String ipAddress) {
        public static Actor anonymous(String label, String ip) {
            return new Actor(null, label, ip);
        }
    }

    /** Records a successful action by the authenticated caller. */
    @Transactional(propagation = Propagation.MANDATORY)
    public AuditEvent success(com.manageedocs.security.AppUserDetails caller, String action,
                              String resourceType, Object resourceId, Map<String, String> details) {
        return record(new Actor(caller.userId(), caller.email(), com.manageedocs.common.web.RequestInfo.clientIp()),
                action, AuditOutcome.SUCCESS, resourceType, resourceId == null ? null : resourceId.toString(), details);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public AuditEvent record(Actor actor, String action, AuditOutcome outcome,
                             String resourceType, String resourceId, Map<String, String> details) {
        UUID tenantId = TenantContext.require();
        AuditChainHead head = heads.lockHead(tenantId).orElseGet(() -> heads.saveAndFlush(new AuditChainHead(tenantId)));
        // Head rows are normally created with the tenant; the fallback's PK makes a concurrent
        // first-append race fail fast (and the caller's transaction retry) rather than fork the chain.
        long seq = head.getLastSeq() + 1;
        // MySQL DATETIME(6) rounds sub-microsecond precision; fix it here so the stored value hashes identically.
        Instant now = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        String correlationId = MDC.get(CorrelationIdFilter.MDC_KEY);
        String json = AuditHasher.toJson(details);
        String hash = AuditHasher.hash(head.getLastHash(), tenantId, seq, now, actor.id(), action, outcome,
                resourceType, resourceId, correlationId, json);
        AuditEvent event = AuditEventFactory.create(seq, now, actor, action, outcome, resourceType, resourceId,
                correlationId, json, head.getLastHash(), hash);
        events.save(event);
        AuditEventFactory.advance(head, seq, hash);
        return event;
    }

    /** Verifies the current tenant's whole chain. Returns the first broken seq, or -1 if intact. */
    @Transactional(readOnly = true)
    public long verifyChain() {
        String prev = AuditChainHead.GENESIS_HASH;
        long expectedSeq = 1;
        List<AuditEvent> all = events.findAllByOrderBySeqAsc();
        for (AuditEvent e : all) {
            if (e.getSeq() != expectedSeq || !e.getPrevHash().equals(prev) || !AuditHasher.hashOf(e).equals(e.getHash())) {
                return e.getSeq();
            }
            prev = e.getHash();
            expectedSeq++;
        }
        return -1;
    }
}
