package com.manageedocs.audit.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.util.UUID;

/** Per-tenant tip of the audit hash chain; locked FOR UPDATE while appending. */
@Entity
@Table(name = "audit_chain_head")
public class AuditChainHead {

    public static final String GENESIS_HASH = "0".repeat(64);

    @Id
    @Column(name = "tenant_id")
    private UUID tenantId;

    @Column(name = "last_seq", nullable = false)
    private long lastSeq;

    @Column(name = "last_hash", nullable = false, length = 64)
    private String lastHash;

    protected AuditChainHead() {
    }

    public AuditChainHead(UUID tenantId) {
        this.tenantId = tenantId;
        this.lastSeq = 0;
        this.lastHash = GENESIS_HASH;
    }

    void advance(long seq, String hash) {
        this.lastSeq = seq;
        this.lastHash = hash;
    }

    public UUID getTenantId() { return tenantId; }
    public long getLastSeq() { return lastSeq; }
    public String getLastHash() { return lastHash; }
}
