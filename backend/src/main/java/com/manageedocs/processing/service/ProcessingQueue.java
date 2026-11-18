package com.manageedocs.processing.service;

import com.manageedocs.common.persistence.UuidBytes;
import com.manageedocs.processing.model.ProcessingJob;
import com.manageedocs.processing.repository.ProcessingJobRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.UUID;

/**
 * Enqueues processing in the caller's transaction (outbox semantics): the job exists if and only if
 * the version it processes was committed.
 */
@Service
public class ProcessingQueue {

    private final ProcessingJobRepository jobs;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public ProcessingQueue(ProcessingJobRepository jobs, JdbcTemplate jdbc, Clock clock) {
        this.jobs = jobs;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void enqueue(UUID tenantId, UUID documentId, UUID documentVersionId) {
        jobs.save(new ProcessingJob(tenantId, documentId, documentVersionId, clock.instant()));
    }

    /** Makes a version due again (idempotent: resets its single job row) and marks it STORED. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void requeue(UUID tenantId, UUID documentId, UUID documentVersionId) {
        ProcessingJob job = jobs.findByDocumentVersionId(documentVersionId)
                .orElseGet(() -> new ProcessingJob(tenantId, documentId, documentVersionId, clock.instant()));
        job.reset(clock.instant());
        jobs.save(job);
        setVersionStatus(documentVersionId, "STORED");
    }

    /**
     * Version status is the only mutable column on an otherwise immutable row, so it is updated
     * with plain SQL rather than through the {@code @Immutable} entity.
     */
    public void setVersionStatus(UUID documentVersionId, String status) {
        jdbc.update("update document_version set processing_status = ? where id = ?", status, UuidBytes.of(documentVersionId));
    }
}
