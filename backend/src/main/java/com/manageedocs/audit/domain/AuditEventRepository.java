package com.manageedocs.audit.domain;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/** Tenant-scoped by {@code @TenantId}. Read/insert only — the entity is {@code @Immutable}. */
public interface AuditEventRepository extends JpaRepository<AuditEvent, UUID> {

    Page<AuditEvent> findAllByOrderBySeqDesc(Pageable pageable);

    List<AuditEvent> findAllByOrderBySeqAsc();
}
