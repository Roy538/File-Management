package com.manageedocs.retention.service;

import com.manageedocs.audit.service.AuditService;
import com.manageedocs.documents.model.Document;
import com.manageedocs.exception.ApiException;
import com.manageedocs.retention.dto.RetentionDtos.CreatePolicyRequest;
import com.manageedocs.retention.dto.RetentionDtos.DueDocument;
import com.manageedocs.retention.dto.RetentionDtos.PolicyView;
import com.manageedocs.retention.model.RetentionPolicy;
import com.manageedocs.retention.repository.LegalHoldDocumentRepository;
import com.manageedocs.retention.repository.RetentionPolicyRepository;
import com.manageedocs.security.AppUserDetails;
import com.manageedocs.taxonomy.model.Cabinet;
import com.manageedocs.taxonomy.model.DocumentType;
import com.manageedocs.taxonomy.repository.CabinetRepository;
import com.manageedocs.taxonomy.repository.DocumentTypeRepository;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Retention policies, their assignment, and "which documents are due". A document's effective policy
 * is its document type's policy if set, otherwise its cabinet's.
 */
@Service
public class RetentionService {

    private final RetentionPolicyRepository policies;
    private final CabinetRepository cabinets;
    private final DocumentTypeRepository types;
    private final LegalHoldDocumentRepository holds;
    private final AuditService audit;
    private final EntityManager em;
    private final Clock clock;

    public RetentionService(RetentionPolicyRepository policies, CabinetRepository cabinets, DocumentTypeRepository types,
                            LegalHoldDocumentRepository holds, AuditService audit, EntityManager em, Clock clock) {
        this.policies = policies;
        this.cabinets = cabinets;
        this.types = types;
        this.holds = holds;
        this.audit = audit;
        this.em = em;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<PolicyView> list() {
        return policies.findAllByOrderByNameAsc().stream().map(PolicyView::of).toList();
    }

    @Transactional
    public PolicyView create(AppUserDetails caller, CreatePolicyRequest req) {
        if (policies.existsByNameIgnoreCase(req.name().trim())) {
            throw ApiException.conflict("POLICY_EXISTS", "A retention policy with this name already exists");
        }
        RetentionPolicy p = policies.save(new RetentionPolicy(req.name(), req.description(), req.retainFor(),
                req.trigger(), req.action()));
        audit.success(caller, "RETENTION_POLICY_CREATED", "RETENTION_POLICY", p.getId(), Map.of(
                "name", p.getName(), "retainFor", p.getRetainFor(), "trigger", p.getTrigger().name(),
                "action", p.getAction().name()));
        return PolicyView.of(p);
    }

    @Transactional
    public void deactivate(AppUserDetails caller, UUID id) {
        RetentionPolicy p = policy(id);
        p.deactivate();
        audit.success(caller, "RETENTION_POLICY_DEACTIVATED", "RETENTION_POLICY", id, Map.of("name", p.getName()));
    }

    @Transactional
    public void assignToCabinet(AppUserDetails caller, UUID cabinetId, UUID policyId) {
        Cabinet c = cabinets.findById(cabinetId).orElseThrow(() -> ApiException.notFound("Cabinet"));
        if (policyId != null) requireActive(policyId);
        c.assignRetentionPolicy(policyId);
        audit.success(caller, "RETENTION_POLICY_ASSIGNED", "CABINET", cabinetId,
                Map.of("policyId", String.valueOf(policyId)));
    }

    @Transactional
    public void assignToDocumentType(AppUserDetails caller, UUID typeId, UUID policyId) {
        DocumentType t = types.findById(typeId).orElseThrow(() -> ApiException.notFound("Document type"));
        if (policyId != null) requireActive(policyId);
        t.assignRetentionPolicy(policyId);
        audit.success(caller, "RETENTION_POLICY_ASSIGNED", "DOCUMENT_TYPE", typeId,
                Map.of("policyId", String.valueOf(policyId)));
    }

    /** Documents due now or within {@code withinDays} (records-manager worklist / dashboard). */
    @Transactional(readOnly = true)
    public List<DueDocument> due(int withinDays) {
        Instant horizon = clock.instant().plusSeconds(Math.max(0, withinDays) * 86_400L);
        List<DueDocument> out = new ArrayList<>();
        for (RetentionPolicy p : policies.findByActiveTrue()) {
            List<Document> docs = candidates(p, horizon);
            Set<UUID> held = docs.isEmpty() ? Set.of()
                    : new HashSet<>(holds.findHeld(docs.stream().map(Document::getId).toList()));
            for (Document d : docs) {
                out.add(new DueDocument(d.getId(), d.getTitle(), p.getId(), p.getName(), p.getAction(),
                        p.dueAt(triggerDate(p, d)), held.contains(d.getId())));
            }
        }
        out.sort(Comparator.comparing(DueDocument::dueAt));
        return out;
    }

    /**
     * Live documents governed by {@code policy} whose retention period ends on or before {@code asOf}.
     * ARCHIVE policies skip documents already archived.
     */
    public List<Document> candidates(RetentionPolicy policy, Instant asOf) {
        String trigger = policy.getTrigger() == RetentionPolicy.Trigger.CREATED ? "d.createdAt" : "d.updatedAt";
        String jpql = "select d from Document d where " + trigger + " <= :cutoff"
                + (policy.getAction() == RetentionPolicy.Action.ARCHIVE
                ? " and d.status <> com.manageedocs.documents.model.Document.Status.ARCHIVED" : "")
                + " and (exists (select 1 from DocumentType t where t.id = d.documentTypeId and t.retentionPolicyId = :pid)"
                + "  or (not exists (select 1 from DocumentType t where t.id = d.documentTypeId and t.retentionPolicyId is not null)"
                + "      and exists (select 1 from Cabinet c where c.id = d.cabinetId and c.retentionPolicyId = :pid)))"
                + " order by " + trigger;
        return em.createQuery(jpql, Document.class)
                .setParameter("cutoff", policy.dueCutoff(asOf))
                .setParameter("pid", policy.getId())
                .getResultList();
    }

    /** The policy that governs {@code d} right now (type wins over cabinet), or null. */
    public UUID effectivePolicyId(Document d) {
        if (d.getDocumentTypeId() != null) {
            UUID fromType = types.findById(d.getDocumentTypeId()).map(DocumentType::getRetentionPolicyId).orElse(null);
            if (fromType != null) return fromType;
        }
        return cabinets.findById(d.getCabinetId()).map(Cabinet::getRetentionPolicyId).orElse(null);
    }

    public static Instant triggerDate(RetentionPolicy p, Document d) {
        return p.getTrigger() == RetentionPolicy.Trigger.CREATED ? d.getCreatedAt() : d.getUpdatedAt();
    }

    public RetentionPolicy policy(UUID id) {
        return policies.findById(id).orElseThrow(() -> ApiException.notFound("Retention policy"));
    }

    private void requireActive(UUID policyId) {
        if (!policy(policyId).isActive()) throw new IllegalArgumentException("That retention policy is inactive");
    }
}
