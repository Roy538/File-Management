package com.manageedocs.audit.domain;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface AuditChainHeadRepository extends JpaRepository<AuditChainHead, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select h from AuditChainHead h where h.tenantId = :tenantId")
    Optional<AuditChainHead> lockHead(@Param("tenantId") UUID tenantId);
}
