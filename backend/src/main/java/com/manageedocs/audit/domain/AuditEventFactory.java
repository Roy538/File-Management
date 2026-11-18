package com.manageedocs.audit.domain;

import com.manageedocs.audit.application.AuditService.Actor;

import java.time.Instant;

/** Keeps AuditEvent/AuditChainHead mutators package-private to the domain. */
public final class AuditEventFactory {

    private AuditEventFactory() {
    }

    public static AuditEvent create(long seq, Instant occurredAt, Actor actor, String action, AuditOutcome outcome,
                                    String resourceType, String resourceId, String correlationId, String details,
                                    String prevHash, String hash) {
        return new AuditEvent(seq, occurredAt, actor.id(), actor.label(), action, outcome, resourceType, resourceId,
                correlationId, actor.ipAddress(), details, prevHash, hash);
    }

    public static void advance(AuditChainHead head, long seq, String hash) {
        head.advance(seq, hash);
    }
}
