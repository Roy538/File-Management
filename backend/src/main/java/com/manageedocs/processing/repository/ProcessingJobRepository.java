package com.manageedocs.processing.repository;

import com.manageedocs.processing.model.ProcessingJob;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProcessingJobRepository extends JpaRepository<ProcessingJob, UUID> {

    /**
     * Claims due jobs. SKIP LOCKED lets every replica poll the same queue: rows another worker has
     * locked are skipped rather than waited on or processed twice. Must run in a short transaction
     * that commits the RUNNING state before any slow work starts.
     */
    @Query(value = """
            select * from processing_job
            where status = 'PENDING' and next_attempt_at <= :now
            order by next_attempt_at
            limit :limit
            for update skip locked
            """, nativeQuery = true)
    List<ProcessingJob> lockDue(@Param("now") Instant now, @Param("limit") int limit);

    Optional<ProcessingJob> findByDocumentVersionId(UUID documentVersionId);

    List<ProcessingJob> findByTenantIdAndDocumentIdOrderByCreatedAtDesc(UUID tenantId, UUID documentId);

    /**
     * Crash recovery: a RUNNING job whose worker died never finishes. Processing is idempotent
     * (re-scanning and re-indexing the same bytes is harmless), so it is simply made due again.
     */
    @Modifying
    @Query("""
            update ProcessingJob j set j.status = com.manageedocs.processing.model.ProcessingJob.Status.PENDING,
                   j.claimedAt = null, j.claimedBy = null, j.nextAttemptAt = :now, j.updatedAt = :now
            where j.status = com.manageedocs.processing.model.ProcessingJob.Status.RUNNING and j.claimedAt < :cutoff
            """)
    int reapStale(@Param("cutoff") Instant cutoff, @Param("now") Instant now);

    long countByTenantIdAndStatus(UUID tenantId, ProcessingJob.Status status);
}
