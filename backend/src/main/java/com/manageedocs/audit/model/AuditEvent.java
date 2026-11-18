package com.manageedocs.audit.model;

import com.manageedocs.common.persistence.Ids;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/** Append-only audit record (ADR-011). {@code @Immutable}: Hibernate never issues UPDATEs. */
@Entity
@Immutable
@Table(name = "audit_event")
public class AuditEvent {

    @Id
    private UUID id = Ids.newId();

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(nullable = false)
    private long seq;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "actor_id")
    private UUID actorId;

    @Column(name = "actor_label", length = 254)
    private String actorLabel;

    @Column(nullable = false, length = 64)
    private String action;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private AuditOutcome outcome;

    @Column(name = "resource_type", length = 64)
    private String resourceType;

    @Column(name = "resource_id", length = 64)
    private String resourceId;

    @Column(name = "correlation_id", length = 64)
    private String correlationId;

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @Column(columnDefinition = "text")
    private String details;

    @Column(name = "prev_hash", nullable = false, length = 64)
    private String prevHash;

    @Column(nullable = false, length = 64)
    private String hash;

    protected AuditEvent() {
    }

    AuditEvent(long seq, Instant occurredAt, UUID actorId, String actorLabel, String action, AuditOutcome outcome,
               String resourceType, String resourceId, String correlationId, String ipAddress, String details,
               String prevHash, String hash) {
        this.seq = seq;
        this.occurredAt = occurredAt;
        this.actorId = actorId;
        this.actorLabel = actorLabel;
        this.action = action;
        this.outcome = outcome;
        this.resourceType = resourceType;
        this.resourceId = resourceId;
        this.correlationId = correlationId;
        this.ipAddress = ipAddress;
        this.details = details;
        this.prevHash = prevHash;
        this.hash = hash;
    }

    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public long getSeq() { return seq; }
    public Instant getOccurredAt() { return occurredAt; }
    public UUID getActorId() { return actorId; }
    public String getActorLabel() { return actorLabel; }
    public String getAction() { return action; }
    public AuditOutcome getOutcome() { return outcome; }
    public String getResourceType() { return resourceType; }
    public String getResourceId() { return resourceId; }
    public String getCorrelationId() { return correlationId; }
    public String getIpAddress() { return ipAddress; }
    public String getDetails() { return details; }
    public String getPrevHash() { return prevHash; }
    public String getHash() { return hash; }
}
