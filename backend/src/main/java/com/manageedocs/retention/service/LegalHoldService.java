package com.manageedocs.retention.service;

import com.manageedocs.audit.service.AuditService;
import com.manageedocs.documents.model.Document;
import com.manageedocs.documents.repository.DocumentRepository;
import com.manageedocs.exception.ApiException;
import com.manageedocs.retention.dto.RetentionDtos.AddToHoldRequest;
import com.manageedocs.retention.dto.RetentionDtos.CreateHoldRequest;
import com.manageedocs.retention.dto.RetentionDtos.HeldDocumentView;
import com.manageedocs.retention.dto.RetentionDtos.HoldView;
import com.manageedocs.retention.model.LegalHold;
import com.manageedocs.retention.model.LegalHoldDocument;
import com.manageedocs.retention.repository.LegalHoldDocumentRepository;
import com.manageedocs.retention.repository.LegalHoldRepository;
import com.manageedocs.security.AppUserDetails;
import com.manageedocs.taxonomy.model.Folder;
import com.manageedocs.taxonomy.repository.FolderRepository;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Legal holds. Holding a document stops deletion and destruction (never archival, which is
 * non-destructive) until every hold covering it is released. Holds are organisation-wide records
 * managed by holders of LEGAL_HOLD_MANAGE; documents are resolved within the caller's tenant only.
 */
@Service
public class LegalHoldService {

    private final LegalHoldRepository holds;
    private final LegalHoldDocumentRepository heldDocs;
    private final DocumentRepository documents;
    private final FolderRepository folders;
    private final AuditService audit;
    private final EntityManager em;
    private final Clock clock;

    public LegalHoldService(LegalHoldRepository holds, LegalHoldDocumentRepository heldDocs, DocumentRepository documents,
                            FolderRepository folders, AuditService audit, EntityManager em, Clock clock) {
        this.holds = holds;
        this.heldDocs = heldDocs;
        this.documents = documents;
        this.folders = folders;
        this.audit = audit;
        this.em = em;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<HoldView> list() {
        return holds.findAllByOrderByCreatedAtDesc().stream().map(h -> view(h, false)).toList();
    }

    @Transactional(readOnly = true)
    public HoldView get(UUID id) {
        return view(hold(id), true);
    }

    @Transactional
    public HoldView create(AppUserDetails caller, CreateHoldRequest req) {
        LegalHold h = holds.save(new LegalHold(req.name(), req.reason(), req.matterRef(), caller.userId()));
        audit.success(caller, "LEGAL_HOLD_CREATED", "LEGAL_HOLD", h.getId(),
                Map.of("name", h.getName(), "matterRef", String.valueOf(h.getMatterRef())));
        return view(h, true);
    }

    @Transactional
    public HoldView addDocuments(AppUserDetails caller, UUID holdId, AddToHoldRequest req) {
        LegalHold h = hold(holdId);
        if (!h.isActive()) throw ApiException.conflict("HOLD_RELEASED", "Documents cannot be added to a released hold");
        Set<UUID> ids = new LinkedHashSet<>(req.documentIds() == null ? Set.of() : req.documentIds());
        if (req.folderId() != null) {
            Folder f = folders.findById(req.folderId()).orElseThrow(() -> ApiException.notFound("Folder"));
            List<UUID> subtree = folders.findSubtree(f.getPath()).stream().map(Folder::getId).toList();
            ids.addAll(em.createQuery("select d.id from Document d where d.folderId in :ids", UUID.class)
                    .setParameter("ids", subtree).getResultList());
        }
        if (ids.isEmpty()) throw new IllegalArgumentException("Give documentIds or a folderId");
        Map<UUID, Document> found = documents.findAllById(ids).stream().collect(Collectors.toMap(Document::getId, Function.identity()));
        if (found.size() != ids.size()) throw ApiException.notFound("Document");
        int added = 0;
        for (UUID id : ids) {
            LegalHoldDocument.Key key = new LegalHoldDocument.Key(holdId, id);
            if (!heldDocs.existsById(key)) {
                heldDocs.save(new LegalHoldDocument(holdId, id, caller.userId(), clock.instant()));
                added++;
            }
        }
        audit.success(caller, "LEGAL_HOLD_DOCUMENTS_ADDED", "LEGAL_HOLD", holdId, Map.of(
                "added", Integer.toString(added),
                "documentIds", ids.stream().map(UUID::toString).collect(Collectors.joining(","))));
        return view(h, true);
    }

    @Transactional
    public HoldView removeDocument(AppUserDetails caller, UUID holdId, UUID documentId) {
        LegalHold h = hold(holdId);
        LegalHoldDocument.Key key = new LegalHoldDocument.Key(holdId, documentId);
        if (!heldDocs.existsById(key)) throw ApiException.notFound("Held document");
        heldDocs.deleteById(key);
        audit.success(caller, "LEGAL_HOLD_DOCUMENT_REMOVED", "LEGAL_HOLD", holdId, Map.of("documentId", documentId.toString()));
        return view(h, true);
    }

    @Transactional
    public HoldView release(AppUserDetails caller, UUID holdId, String reason) {
        LegalHold h = hold(holdId);
        h.release(caller.userId(), reason, clock.instant());
        audit.success(caller, "LEGAL_HOLD_RELEASED", "LEGAL_HOLD", holdId, Map.of("reason", reason));
        return view(h, true);
    }

    private LegalHold hold(UUID id) {
        return holds.findById(id).orElseThrow(() -> ApiException.notFound("Legal hold"));
    }

    private HoldView view(LegalHold h, boolean withDocuments) {
        List<HeldDocumentView> docs = List.of();
        if (withDocuments) {
            List<LegalHoldDocument> items = heldDocs.findByHold(h.getId());
            Map<UUID, String> titles = documents.findAllById(items.stream().map(i -> i.getId().documentId()).toList())
                    .stream().collect(Collectors.toMap(Document::getId, Document::getTitle));
            docs = items.stream().map(i -> new HeldDocumentView(i.getId().documentId(), titles.get(i.getId().documentId()),
                    i.getAddedBy(), i.getAddedAt())).toList();
        }
        return new HoldView(h.getId(), h.getName(), h.getReason(), h.getMatterRef(), h.isActive(), h.getCreatedBy(),
                h.getCreatedAt(), h.getReleasedAt(), h.getReleaseReason(), docs);
    }
}
