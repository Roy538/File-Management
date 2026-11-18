package com.manageedocs.processing.service;

import com.manageedocs.audit.service.AuditService;
import com.manageedocs.documents.model.Document;
import com.manageedocs.documents.model.DocumentVersion;
import com.manageedocs.documents.repository.DocumentRepository;
import com.manageedocs.documents.repository.DocumentVersionRepository;
import com.manageedocs.exception.ApiException;
import com.manageedocs.permissions.model.ResourceRight;
import com.manageedocs.processing.model.ProcessingJob;
import com.manageedocs.processing.repository.ProcessingJobRepository;
import com.manageedocs.security.AppUserDetails;
import com.manageedocs.taxonomy.service.TaxonomyAccess;
import com.manageedocs.tenancy.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Visibility into and control over the pipeline: history per document, reprocess, full re-index. */
@Service
public class ProcessingAdminService {

    public record JobView(int versionNo, DocumentVersion.ProcessingStatus versionStatus, ProcessingJob.Status jobStatus,
                          int attempts, ProcessingJob.ScanResult scanResult, Integer extractedChars, String note,
                          Instant createdAt, Instant completedAt, Instant nextAttemptAt) {
    }

    private final ProcessingJobRepository jobs;
    private final DocumentRepository documents;
    private final DocumentVersionRepository versions;
    private final ProcessingQueue queue;
    private final TaxonomyAccess access;
    private final AuditService audit;

    public ProcessingAdminService(ProcessingJobRepository jobs, DocumentRepository documents,
                                  DocumentVersionRepository versions, ProcessingQueue queue, TaxonomyAccess access,
                                  AuditService audit) {
        this.jobs = jobs;
        this.documents = documents;
        this.versions = versions;
        this.queue = queue;
        this.access = access;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<JobView> history(AppUserDetails caller, UUID documentId) {
        Document doc = visible(caller, documentId, ResourceRight.VIEW);
        Map<UUID, DocumentVersion> byId = versions.findByDocumentIdOrderByVersionNoDesc(doc.getId()).stream()
                .collect(Collectors.toMap(DocumentVersion::getId, Function.identity()));
        // processing_job is not tenant-filtered; the explicit tenant predicate keeps it scoped.
        return jobs.findByTenantIdAndDocumentIdOrderByCreatedAtDesc(TenantContext.require(), documentId).stream()
                .filter(j -> byId.containsKey(j.getDocumentVersionId()))
                .map(j -> {
                    DocumentVersion v = byId.get(j.getDocumentVersionId());
                    return new JobView(v.getVersionNo(), v.getProcessingStatus(), j.getStatus(), j.getAttempts(),
                            j.getScanResult(), j.getExtractedChars(), j.getLastError(), j.getCreatedAt(),
                            j.getCompletedAt(), j.getNextAttemptAt());
                })
                .sorted((a, b) -> Integer.compare(b.versionNo(), a.versionNo()))
                .toList();
    }

    /** Re-runs the pipeline for the current version (e.g. after a scanner outage left it FAILED). */
    @Transactional
    public void reprocess(AppUserDetails caller, UUID documentId) {
        Document doc = visible(caller, documentId, ResourceRight.EDIT);
        DocumentVersion v = versions.findByDocumentIdAndVersionNo(documentId, doc.getCurrentVersionNo()).orElseThrow();
        queue.requeue(doc.getTenantId(), documentId, v.getId());
        audit.success(caller, "DOCUMENT_REPROCESS_REQUESTED", "DOCUMENT", documentId,
                Map.of("versionNo", Integer.toString(v.getVersionNo())));
    }

    /** Rebuilds the organisation's search index by reprocessing every document's current version. */
    @Transactional
    public int reindexAll(AppUserDetails caller) {
        List<Document> all = documents.findAll();
        Map<UUID, DocumentVersion> current = all.isEmpty() ? Map.of() : versions
                .findCurrentFor(all.stream().map(Document::getId).toList()).stream()
                .collect(Collectors.toMap(DocumentVersion::getDocumentId, Function.identity()));
        for (Document d : all) {
            DocumentVersion v = current.get(d.getId());
            if (v != null) queue.requeue(d.getTenantId(), d.getId(), v.getId());
        }
        audit.success(caller, "SEARCH_REINDEX_REQUESTED", "TENANT", caller.tenantId(),
                Map.of("documents", Integer.toString(current.size())));
        return current.size();
    }

    @Transactional(readOnly = true)
    public Map<ProcessingJob.Status, Long> stats(AppUserDetails caller) {
        Map<ProcessingJob.Status, Long> out = new EnumMap<>(ProcessingJob.Status.class);
        for (ProcessingJob.Status s : ProcessingJob.Status.values()) {
            out.put(s, jobs.countByTenantIdAndStatus(caller.tenantId(), s));
        }
        return out;
    }

    private Document visible(AppUserDetails caller, UUID documentId, ResourceRight right) {
        Document d = documents.findById(documentId).orElseThrow(() -> ApiException.notFound("Document"));
        access.policy().require(access.onDocument(caller, d.getCabinetId(), access.folder(d.getFolderId()), d.getId()),
                right, "Document", d.getId());
        return d;
    }
}
