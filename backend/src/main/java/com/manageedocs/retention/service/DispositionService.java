package com.manageedocs.retention.service;

import com.manageedocs.audit.service.AuditService;
import com.manageedocs.audit.model.AuditOutcome;
import com.manageedocs.documents.model.Document;
import com.manageedocs.documents.model.DocumentVersion;
import com.manageedocs.documents.repository.DocumentRepository;
import com.manageedocs.documents.repository.DocumentVersionRepository;
import com.manageedocs.exception.ApiException;
import com.manageedocs.retention.dto.RetentionDtos.DispositionItemView;
import com.manageedocs.retention.dto.RetentionDtos.DispositionRunView;
import com.manageedocs.retention.dto.RetentionDtos.EvaluationResult;
import com.manageedocs.retention.model.DispositionItem;
import com.manageedocs.retention.model.DispositionRun;
import com.manageedocs.retention.model.RetentionPolicy;
import com.manageedocs.retention.repository.DispositionItemRepository;
import com.manageedocs.retention.repository.DispositionRunRepository;
import com.manageedocs.retention.repository.LegalHoldDocumentRepository;
import com.manageedocs.retention.repository.RetentionPolicyRepository;
import com.manageedocs.search.repository.DocumentTextRepository;
import com.manageedocs.security.AppUserDetails;
import com.manageedocs.storage.StoragePort;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Applies retention. ARCHIVE is applied automatically (non-destructive, reversible by an admin in the
 * data, audited). DESTROY is never automatic: evaluation <em>proposes</em> a disposition run and a
 * records manager approves it. At execution every item is re-checked (still exists, still governed
 * by the same policy, still due, not under a legal hold) because days may pass between proposal and
 * approval. Destroyed documents keep their row and version metadata (with SHA-256 digests) as
 * evidence; their binaries and extracted text are purged.
 */
@Service
public class DispositionService {

    private static final Logger log = LoggerFactory.getLogger(DispositionService.class);
    private static final AuditService.Actor SYSTEM = AuditService.Actor.anonymous("system:retention", null);

    private final RetentionService retention;
    private final RetentionPolicyRepository policies;
    private final DispositionRunRepository runs;
    private final DispositionItemRepository items;
    private final LegalHoldDocumentRepository holds;
    private final DocumentRepository documents;
    private final DocumentVersionRepository versions;
    private final DocumentTextRepository texts;
    private final StoragePort storage;
    private final AuditService audit;
    private final TransactionTemplate tx;
    private final Clock clock;

    public DispositionService(RetentionService retention, RetentionPolicyRepository policies, DispositionRunRepository runs,
                              DispositionItemRepository items, LegalHoldDocumentRepository holds,
                              DocumentRepository documents, DocumentVersionRepository versions,
                              DocumentTextRepository texts, StoragePort storage, AuditService audit,
                              TransactionTemplate tx, Clock clock) {
        this.retention = retention;
        this.policies = policies;
        this.runs = runs;
        this.items = items;
        this.holds = holds;
        this.documents = documents;
        this.versions = versions;
        this.texts = texts;
        this.storage = storage;
        this.audit = audit;
        this.tx = tx;
        this.clock = clock;
    }

    /**
     * Evaluates every active policy for the current tenant. {@code caller} null = the scheduler.
     * Must run with the tenant pinned (request or {@code TenantContext.runAs}).
     */
    public EvaluationResult evaluate(AppUserDetails caller) {
        return tx.execute(s -> {
            Instant now = clock.instant();
            int archived = 0;
            int skippedHold = 0;
            List<DispositionItem> proposals = new ArrayList<>();
            DispositionRun run = runs.findFirstByStatus(DispositionRun.Status.PROPOSED).orElse(null);
            Set<UUID> alreadyProposed = run == null ? Set.of()
                    : items.findByRunIdOrderByDueAtAsc(run.getId()).stream().map(DispositionItem::getDocumentId)
                    .collect(Collectors.toSet());

            for (RetentionPolicy p : policies.findByActiveTrue()) {
                List<Document> due = retention.candidates(p, now);
                if (due.isEmpty()) continue;
                Set<UUID> held = new HashSet<>(holds.findHeld(due.stream().map(Document::getId).toList()));
                for (Document d : due) {
                    if (p.getAction() == RetentionPolicy.Action.ARCHIVE) {
                        d.archive(now);   // non-destructive: allowed even under a legal hold
                        record(caller, "DOCUMENT_ARCHIVED", d.getId(), Map.of("policy", p.getName()));
                        archived++;
                    } else if (held.contains(d.getId())) {
                        skippedHold++;
                    } else if (!alreadyProposed.contains(d.getId())) {
                        if (run == null) run = runs.save(new DispositionRun(now));
                        proposals.add(items.save(new DispositionItem(run.getId(), d.getId(), p.getId(),
                                p.dueAt(RetentionService.triggerDate(p, d)))));
                    }
                }
            }
            if (!proposals.isEmpty()) {
                record(caller, "DISPOSITION_PROPOSED", run.getId(), Map.of("documents", Integer.toString(proposals.size())));
            }
            return new EvaluationResult(archived, proposals.size(), skippedHold,
                    run == null ? null : run.getId());
        });
    }

    /** Executes a proposed run. Destruction is irreversible; every item is re-validated first. */
    public DispositionRunView approve(AppUserDetails caller, UUID runId, Set<UUID> exclude) {
        Set<UUID> excluded = exclude == null ? Set.of() : exclude;
        List<String> keysToPurge = tx.execute(s -> {
            DispositionRun run = runs.findById(runId).orElseThrow(() -> ApiException.notFound("Disposition run"));
            if (run.getStatus() != DispositionRun.Status.PROPOSED) {
                throw ApiException.conflict("RUN_DECIDED", "This disposition run has already been decided");
            }
            Instant now = clock.instant();
            Map<UUID, RetentionPolicy> policyById = new HashMap<>();
            List<String> keys = new ArrayList<>();
            for (DispositionItem item : items.findByRunIdOrderByDueAtAsc(runId)) {
                if (excluded.contains(item.getDocumentId())) {
                    item.resolve(DispositionItem.Outcome.SKIPPED_EXCLUDED, "Kept by records manager");
                    continue;
                }
                Document d = documents.findForUpdate(item.getDocumentId()).orElse(null);
                if (d == null) {
                    item.resolve(DispositionItem.Outcome.SKIPPED_CHANGED, "Document no longer exists");
                    continue;
                }
                if (holds.isUnderActiveHold(d.getId())) {
                    item.resolve(DispositionItem.Outcome.SKIPPED_HOLD, "Placed under legal hold after proposal");
                    continue;
                }
                RetentionPolicy p = policyById.computeIfAbsent(item.getPolicyId(), retention::policy);
                if (!p.isActive() || !p.getId().equals(retention.effectivePolicyId(d))
                        || RetentionService.triggerDate(p, d).isAfter(p.dueCutoff(now))) {
                    item.resolve(DispositionItem.Outcome.SKIPPED_CHANGED, "Policy, classification or dates changed since proposal");
                    continue;
                }
                List<DocumentVersion> vs = versions.findByDocumentIdOrderByVersionNoDesc(d.getId());
                d.destroy(caller.userId(), now);
                for (DocumentVersion v : vs) {
                    texts.findById(v.getId()).ifPresent(texts::delete);
                    keys.add(v.getStorageKey());
                }
                item.resolve(DispositionItem.Outcome.DESTROYED, null);
                audit.success(caller, "DOCUMENT_DESTROYED", "DOCUMENT", d.getId(), Map.of(
                        "title", d.getTitle(), "policy", p.getName(), "runId", runId.toString(),
                        "versions", vs.stream().map(v -> v.getVersionNo() + ":" + v.getSha256()).collect(Collectors.joining(","))));
            }
            run.executed(caller.userId(), now);
            audit.success(caller, "DISPOSITION_EXECUTED", "DISPOSITION_RUN", runId, Map.of(
                    "excluded", Integer.toString(excluded.size())));
            return keys;
        });
        // Binaries go after the commit. A failed delete leaves an object that only a destroyed document
        // references; the orphan sweeper treats those as unreferenced and retries.
        int failed = 0;
        for (String key : keysToPurge) if (!storage.deleteQuietly(key)) failed++;
        if (failed > 0) log.warn("{} binary purge(s) failed; the orphan sweeper will retry", failed);
        return view(runId);
    }

    public DispositionRunView cancel(AppUserDetails caller, UUID runId) {
        tx.executeWithoutResult(s -> {
            DispositionRun run = runs.findById(runId).orElseThrow(() -> ApiException.notFound("Disposition run"));
            run.cancel(caller.userId(), clock.instant());
            audit.success(caller, "DISPOSITION_CANCELLED", "DISPOSITION_RUN", runId, null);
        });
        return view(runId);
    }

    public List<DispositionRunView> list() {
        return tx.execute(s -> runs.findAllByOrderByProposedAtDesc().stream().map(r -> view(r, false)).toList());
    }

    public DispositionRunView view(UUID runId) {
        return tx.execute(s -> view(runs.findById(runId).orElseThrow(() -> ApiException.notFound("Disposition run")), true));
    }

    private DispositionRunView view(DispositionRun r, boolean withItems) {
        List<DispositionItemView> list = List.of();
        if (withItems) {
            List<DispositionItem> its = items.findByRunIdOrderByDueAtAsc(r.getId());
            // Titles via a query that ignores the soft-delete filter would expose deleted titles; destroyed
            // documents keep their title in the audit trail instead, so a missing title is shown as null.
            Map<UUID, String> titles = documents.findAllById(its.stream().map(DispositionItem::getDocumentId).toList())
                    .stream().collect(Collectors.toMap(Document::getId, Document::getTitle));
            list = its.stream().map(i -> new DispositionItemView(i.getDocumentId(), titles.get(i.getDocumentId()),
                    i.getPolicyId(), i.getDueAt(), i.getOutcome(), i.getNote())).toList();
        }
        return new DispositionRunView(r.getId(), r.getStatus(), r.getProposedAt(), r.getDecidedBy(), r.getDecidedAt(),
                r.getExecutedAt(), list);
    }

    private void record(AppUserDetails caller, String action, UUID resourceId, Map<String, String> details) {
        String type = action.startsWith("DISPOSITION") ? "DISPOSITION_RUN" : "DOCUMENT";
        if (caller != null) {
            audit.success(caller, action, type, resourceId, details);
        } else {
            audit.record(SYSTEM, action, AuditOutcome.SUCCESS, type, resourceId.toString(), details);
        }
    }
}
