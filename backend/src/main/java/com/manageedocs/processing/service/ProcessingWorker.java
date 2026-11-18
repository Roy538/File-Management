package com.manageedocs.processing.service;

import com.manageedocs.audit.model.AuditOutcome;
import com.manageedocs.audit.service.AuditService;
import com.manageedocs.documents.model.DocumentVersion;
import com.manageedocs.documents.repository.DocumentVersionRepository;
import com.manageedocs.processing.model.ProcessingJob;
import com.manageedocs.processing.model.ProcessingJob.ScanResult;
import com.manageedocs.processing.repository.ProcessingJobRepository;
import com.manageedocs.search.model.DocumentText;
import com.manageedocs.search.repository.DocumentTextRepository;
import com.manageedocs.storage.StoragePort;
import com.manageedocs.tenancy.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.InputStream;
import java.lang.management.ManagementFactory;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Drains the processing queue. Three transaction boundaries per job, and they are the design
 * (as in the reference platform's outbound job runner):
 * <ol>
 *   <li><b>claim</b> — lock due rows with SKIP LOCKED, flip to RUNNING, commit (locks released);</li>
 *   <li><b>work</b> — scan and extract with no transaction open (slow I/O never holds DB locks);</li>
 *   <li><b>record</b> — write the outcome in its own transaction; a crash loses at most one result.</li>
 * </ol>
 * Uses {@link TransactionTemplate} rather than {@code @Transactional}: the phases are called from
 * {@link #runOnce()} on the same bean, and self-invocation would bypass the proxy.
 *
 * <p>Version status: STORED → PROCESSING → AVAILABLE (scanned clean or scanning disabled; text
 * extraction failure does not block availability) | QUARANTINED (malware) | FAILED (could not be
 * scanned after all retries; not downloadable until reprocessed).
 */
@Service
public class ProcessingWorker {

    private static final Logger log = LoggerFactory.getLogger(ProcessingWorker.class);
    private static final String WORKER_ID = ManagementFactory.getRuntimeMXBean().getName();

    private final ProcessingJobRepository jobs;
    private final DocumentVersionRepository versions;
    private final DocumentTextRepository texts;
    private final ProcessingQueue queue;
    private final StoragePort storage;
    private final MalwareScanner scanner;
    private final TextExtractor extractor;
    private final AuditService audit;
    private final ProcessingProperties props;
    private final TransactionTemplate tx;
    private final Clock clock;

    public ProcessingWorker(ProcessingJobRepository jobs, DocumentVersionRepository versions, DocumentTextRepository texts,
                            ProcessingQueue queue, StoragePort storage, MalwareScanner scanner, TextExtractor extractor,
                            AuditService audit, ProcessingProperties props,
                            org.springframework.transaction.PlatformTransactionManager txManager, Clock clock) {
        this.jobs = jobs;
        this.versions = versions;
        this.texts = texts;
        this.queue = queue;
        this.storage = storage;
        this.scanner = scanner;
        this.extractor = extractor;
        this.audit = audit;
        this.props = props;
        // READ COMMITTED: under MySQL's default REPEATABLE READ, concurrent claimers take gap locks on
        // the (status, next_attempt_at) index and deadlock each other — found by the concurrency test.
        this.tx = new TransactionTemplate(txManager);
        this.tx.setIsolationLevel(org.springframework.transaction.TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.clock = clock;
    }

    private record Claimed(UUID jobId, UUID tenantId, UUID versionId) {
    }

    /** Claims and processes one batch. Returns how many jobs were processed. */
    public int runOnce() {
        List<Claimed> batch;
        try {
            batch = claim();
        } catch (org.springframework.dao.PessimisticLockingFailureException e) {
            // Lost a lock race with another worker; nothing was claimed. Next poll tries again.
            log.debug("Claim contended, backing off: {}", e.getClass().getSimpleName());
            return 0;
        }
        if (batch == null) return 0;
        for (Claimed c : batch) {
            TenantContext.runAs(c.tenantId(), () -> process(c));
        }
        return batch.size();
    }

    private List<Claimed> claim() {
        return tx.execute(s -> {
            Instant now = clock.instant();
            return jobs.lockDue(now, props.batchSize()).stream().map(j -> {
                j.claim(WORKER_ID, now);
                queue.setVersionStatus(j.getDocumentVersionId(), "PROCESSING");
                return new Claimed(j.getId(), j.getTenantId(), j.getDocumentVersionId());
            }).toList();
        });
    }

    /** Outcome writes are retried on lock contention so a finished job's result is not lost. */
    private void record(Runnable write) {
        for (int attempt = 1; ; attempt++) {
            try {
                tx.executeWithoutResult(s -> write.run());
                return;
            } catch (org.springframework.dao.PessimisticLockingFailureException e) {
                if (attempt >= 3) throw e;   // left RUNNING; the reaper makes it due again (idempotent)
            }
        }
    }

    /** Runs batches until the queue has nothing due (tests and admin "process now"). */
    public int drain() {
        int total = 0;
        int n;
        while ((n = runOnce()) > 0) total += n;
        return total;
    }

    /** Recovers jobs whose worker died mid-flight. */
    public int reapStale() {
        Instant now = clock.instant();
        Integer n = tx.execute(s -> jobs.reapStale(now.minus(props.claimTimeout()), now));
        if (n != null && n > 0) log.warn("Re-queued {} stale processing job(s)", n);
        return n == null ? 0 : n;
    }

    private void process(Claimed c) {
        DocumentVersion version = tx.execute(s -> versions.findById(c.versionId()).orElse(null));
        if (version == null) {
            recordFailure(c, "Version no longer exists");
            return;
        }
        try {
            MalwareScanner.Verdict verdict;
            try (InputStream in = storage.get(version.getStorageKey())) {
                verdict = scanner.scan(in);
            }
            if (verdict.result() == ScanResult.INFECTED) {
                recordQuarantine(c, version, verdict.signature());
                return;
            }
            String text = null;
            boolean truncated = false;
            String note = null;
            try (InputStream in = storage.get(version.getStorageKey())) {
                TextExtractor.Extracted ex = extractor.extract(in, version.getContentType(), props.maxExtractedChars());
                text = ex.text();
                truncated = ex.truncated();
                if (truncated) note = "Text truncated at " + props.maxExtractedChars() + " characters";
            } catch (Exception e) {
                // Unreadable/encrypted files are still safe to serve; they just are not content-searchable.
                note = "Text extraction failed: " + e.getClass().getSimpleName();
            }
            recordSuccess(c, version, verdict.result(), text, truncated, note);
        } catch (Exception e) {
            log.warn("Processing failed for version {} (attempt will be retried if budget remains): {}",
                    c.versionId(), e.getClass().getSimpleName());
            recordFailure(c, e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    private void recordSuccess(Claimed c, DocumentVersion v, ScanResult scan, String text, boolean truncated, String note) {
        record(() -> {
            Instant now = clock.instant();
            ProcessingJob job = jobs.findById(c.jobId()).orElseThrow();
            String content = text == null ? "" : text;
            texts.findById(v.getId()).ifPresentOrElse(
                    t -> t.replace(content, truncated, now),
                    () -> texts.save(new DocumentText(v.getId(), v.getDocumentId(), content, truncated, now)));
            job.succeed(scan, content.length(), note, now);
            queue.setVersionStatus(v.getId(), "AVAILABLE");
        });
    }

    private void recordQuarantine(Claimed c, DocumentVersion v, String signature) {
        record(() -> {
            Instant now = clock.instant();
            ProcessingJob job = jobs.findById(c.jobId()).orElseThrow();
            job.succeed(ScanResult.INFECTED, null, "Malware detected: " + signature, now);
            queue.setVersionStatus(v.getId(), "QUARANTINED");
            audit.record(AuditService.Actor.anonymous("system:scanner", null), "DOCUMENT_QUARANTINED",
                    AuditOutcome.DENIED, "DOCUMENT", v.getDocumentId().toString(),
                    Map.of("versionNo", Integer.toString(v.getVersionNo()), "signature", String.valueOf(signature)));
        });
        log.warn("Quarantined document {} version {} (signature {})", v.getDocumentId(), v.getVersionNo(), signature);
    }

    private void recordFailure(Claimed c, String error) {
        record(() -> {
            Instant now = clock.instant();
            ProcessingJob job = jobs.findById(c.jobId()).orElseThrow();
            boolean willRetry = job.fail(error, props.maxAttempts(), props.retryBase(), now);
            if (!willRetry) {
                queue.setVersionStatus(c.versionId(), "FAILED");
                audit.record(AuditService.Actor.anonymous("system:processing", null), "DOCUMENT_PROCESSING_FAILED",
                        AuditOutcome.FAILURE, "DOCUMENT", job.getDocumentId().toString(),
                        Map.of("attempts", Integer.toString(job.getAttempts()), "error", String.valueOf(job.getLastError())));
            } else {
                queue.setVersionStatus(c.versionId(), "STORED");
            }
        });
    }
}
