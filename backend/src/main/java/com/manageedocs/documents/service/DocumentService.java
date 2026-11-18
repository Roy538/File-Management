package com.manageedocs.documents.service;

import com.manageedocs.audit.service.AuditService;
import com.manageedocs.common.dto.PagedResponse;
import com.manageedocs.documents.dto.DocumentDtos.DocumentDetail;
import com.manageedocs.documents.dto.DocumentDtos.DocumentSummary;
import com.manageedocs.documents.dto.DocumentDtos.DownloadLink;
import com.manageedocs.documents.dto.DocumentDtos.LockView;
import com.manageedocs.documents.dto.DocumentDtos.UpdateDocumentRequest;
import com.manageedocs.documents.dto.DocumentDtos.UploadResult;
import com.manageedocs.documents.dto.DocumentDtos.VersionView;
import com.manageedocs.documents.model.Document;
import com.manageedocs.documents.model.DocumentVersion;
import com.manageedocs.documents.repository.DocumentRepository;
import com.manageedocs.documents.repository.DocumentVersionRepository;
import com.manageedocs.exception.ApiException;
import com.manageedocs.permissions.model.AclEntry;
import com.manageedocs.permissions.model.ResourceRight;
import com.manageedocs.permissions.service.AccessPolicy;
import com.manageedocs.processing.service.ProcessingQueue;
import com.manageedocs.security.AppUserDetails;
import com.manageedocs.security.Permission;
import com.manageedocs.storage.StoragePort;
import com.manageedocs.storage.StorageProperties;
import com.manageedocs.taxonomy.model.Cabinet;
import com.manageedocs.taxonomy.model.Folder;
import com.manageedocs.taxonomy.repository.SubDividerRepository;
import com.manageedocs.taxonomy.service.TaxonomyAccess;
import com.manageedocs.tenancy.TenantContext;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.manageedocs.permissions.model.ResourceRight.DELETE;
import static com.manageedocs.permissions.model.ResourceRight.DOWNLOAD;
import static com.manageedocs.permissions.model.ResourceRight.EDIT;
import static com.manageedocs.permissions.model.ResourceRight.MANAGE;
import static com.manageedocs.permissions.model.ResourceRight.UPLOAD;
import static com.manageedocs.permissions.model.ResourceRight.VIEW;
import static com.manageedocs.taxonomy.dto.TaxonomyDtos.rightNames;

/**
 * Document lifecycle. Binary I/O happens <em>outside</em> database transactions (a slow upload
 * must not hold row locks), so every write follows: validate → store object → short transaction
 * (rows + audit) → on failure, delete the object (compensation). An object whose delete also fails
 * is an orphan with no row pointing at it; the Phase 4 reconciliation job sweeps those.
 */
@Service
public class DocumentService {

    private static final int HEAD_BYTES = 8192;

    private final DocumentRepository documents;
    private final DocumentVersionRepository versions;
    private final SubDividerRepository subDividers;
    private final MetadataService metadata;
    private final TaxonomyAccess access;
    private final StoragePort storage;
    private final StorageProperties storageProps;
    private final DocumentsProperties props;
    private final AuditService audit;
    private final TransactionTemplate tx;
    private final Clock clock;
    private final ProcessingQueue processing;
    private final com.manageedocs.retention.repository.LegalHoldDocumentRepository holds;

    public DocumentService(DocumentRepository documents, DocumentVersionRepository versions,
                           SubDividerRepository subDividers, MetadataService metadata, TaxonomyAccess access,
                           StoragePort storage, StorageProperties storageProps, DocumentsProperties props,
                           AuditService audit, TransactionTemplate tx, Clock clock, ProcessingQueue processing,
                           com.manageedocs.retention.repository.LegalHoldDocumentRepository holds) {
        this.documents = documents;
        this.versions = versions;
        this.subDividers = subDividers;
        this.metadata = metadata;
        this.access = access;
        this.storage = storage;
        this.storageProps = storageProps;
        this.props = props;
        this.audit = audit;
        this.tx = tx;
        this.clock = clock;
        this.processing = processing;
        this.holds = holds;
    }

    public record UploadCommand(UUID folderId, UUID subDividerId, String title, UUID documentTypeId,
                                Map<String, String> metadata) {
    }

    private record Stored(String key, String safeName, String contentType, long size, String sha256) {
    }

    // ── Upload ────────────────────────────────────────────────────────────

    public UploadResult upload(AppUserDetails caller, UploadCommand cmd, MultipartFile file) {
        Folder folder = access.requireFolder(caller, cmd.folderId(), UPLOAD);
        if (cmd.subDividerId() != null) {
            subDividers.findById(cmd.subDividerId())
                    .filter(s -> s.getFolderId().equals(folder.getId()))
                    .orElseThrow(() -> ApiException.notFound("Sub-divider"));
        }
        List<MetadataService.Typed> typed = metadata.validate(cmd.documentTypeId(), cmd.metadata());

        boolean titleFromFile = cmd.title() == null || cmd.title().isBlank();
        Document doc = new Document(folder.getCabinetId(), folder.getId(), cmd.subDividerId(), cmd.documentTypeId(),
                titleFromFile ? "untitled" : cmd.title(), caller.userId());
        Stored stored = store(TenantContext.require(), doc.getId(), file);
        if (titleFromFile) doc.retitle(stripExtension(stored.safeName()));
        try {
            tx.executeWithoutResult(s -> {
                documents.save(doc);
                DocumentVersion v1 = versions.save(new DocumentVersion(doc.getId(), 1, stored.key(), stored.safeName(),
                        stored.contentType(), stored.size(), stored.sha256(), "Initial upload", null, caller.userId(), clock.instant()));
                // @TenantId is stamped at insert time, so a just-created entity has no tenant yet in memory.
                processing.enqueue(TenantContext.require(), doc.getId(), v1.getId());
                metadata.replace(doc.getId(), typed);
                audit.success(caller, "DOCUMENT_UPLOADED", "DOCUMENT", doc.getId(), Map.of(
                        "title", doc.getTitle(), "folderId", folder.getId().toString(),
                        "contentType", stored.contentType(), "sizeBytes", Long.toString(stored.size()),
                        "sha256", stored.sha256()));
            });
        } catch (RuntimeException e) {
            storage.deleteQuietly(stored.key());
            throw e;
        }
        List<UUID> duplicates = visibleDuplicates(caller, stored.sha256(), doc.getId());
        return new UploadResult(detail(caller, doc.getId()), duplicates);
    }

    /**
     * Adds a new version. Fails with 409 if another user holds the check-out lock, or if
     * {@code expectedCurrentVersionNo} is given and someone else added a version meanwhile.
     */
    public DocumentDetail addVersion(AppUserDetails caller, UUID documentId, MultipartFile file, String comment,
                                     Integer expectedCurrentVersionNo, boolean keepLock) {
        Document doc = load(documentId);
        requireRight(caller, doc, EDIT);
        ensureNotLockedByOther(doc, caller);
        Stored stored = store(doc.getTenantId(), doc.getId(), file);
        try {
            tx.executeWithoutResult(s -> {
                Document locked = documents.findForUpdate(documentId).orElseThrow(() -> ApiException.notFound("Document"));
                ensureNotLockedByOther(locked, caller);
                if (expectedCurrentVersionNo != null && expectedCurrentVersionNo != locked.getCurrentVersionNo()) {
                    throw ApiException.conflict("VERSION_CONFLICT", "A newer version (v" + locked.getCurrentVersionNo()
                            + ") was added meanwhile. Review it before uploading again.");
                }
                int no = locked.nextVersionNo();
                DocumentVersion v = versions.save(new DocumentVersion(documentId, no, stored.key(), stored.safeName(),
                        stored.contentType(), stored.size(), stored.sha256(), comment, null, caller.userId(), clock.instant()));
                processing.enqueue(locked.getTenantId(), documentId, v.getId());
                locked.advanceTo(no);
                if (!keepLock && locked.isLockedBy(caller.userId(), clock.instant())) locked.unlock();
                audit.success(caller, "DOCUMENT_VERSION_CREATED", "DOCUMENT", documentId, Map.of(
                        "versionNo", Integer.toString(no), "sizeBytes", Long.toString(stored.size()),
                        "sha256", stored.sha256()));
            });
        } catch (RuntimeException e) {
            storage.deleteQuietly(stored.key());
            throw e;
        }
        return detail(caller, documentId);
    }

    /** Restores an old version by copying it into a new version; history is never rewritten. */
    public DocumentDetail restore(AppUserDetails caller, UUID documentId, int versionNo, String comment) {
        Document doc = load(documentId);
        requireRight(caller, doc, EDIT);
        ensureNotLockedByOther(doc, caller);
        DocumentVersion source = versions.findByDocumentIdAndVersionNo(documentId, versionNo)
                .orElseThrow(() -> ApiException.notFound("Version"));
        if (versionNo == doc.getCurrentVersionNo()) {
            throw ApiException.conflict("ALREADY_CURRENT", "Version " + versionNo + " is already the current version");
        }
        String key = DocumentVersion.storageKey(doc.getTenantId(), documentId);
        storage.copy(source.getStorageKey(), key);
        try {
            tx.executeWithoutResult(s -> {
                Document locked = documents.findForUpdate(documentId).orElseThrow(() -> ApiException.notFound("Document"));
                ensureNotLockedByOther(locked, caller);
                int no = locked.nextVersionNo();
                DocumentVersion v = versions.save(new DocumentVersion(documentId, no, key, source.getOriginalFilename(), source.getContentType(),
                        source.getSizeBytes(), source.getSha256(),
                        comment == null || comment.isBlank() ? "Restored from version " + versionNo : comment,
                        versionNo, caller.userId(), clock.instant()));
                processing.enqueue(locked.getTenantId(), documentId, v.getId());
                locked.advanceTo(no);
                audit.success(caller, "DOCUMENT_VERSION_RESTORED", "DOCUMENT", documentId, Map.of(
                        "restoredFrom", Integer.toString(versionNo), "newVersionNo", Integer.toString(no)));
            });
        } catch (RuntimeException e) {
            storage.deleteQuietly(key);
            throw e;
        }
        return detail(caller, documentId);
    }

    // ── Read ──────────────────────────────────────────────────────────────

    /** Documents in a folder (optionally one sub-divider), newest first, filtered by title. */
    public PagedResponse<DocumentSummary> list(AppUserDetails caller, UUID folderId, UUID subDividerId, String q,
                                               int page, int size) {
        return tx.execute(s -> {
            Folder folder = access.folder(folderId);
            Cabinet cabinet = access.cabinet(folder.getCabinetId());
            AccessPolicy.Evaluator eval = access.policy().evaluator(caller);
            int folderRights = eval.rights(cabinet, folder.lineage(), null);

            Specification<Document> spec = (root, query, cb) -> cb.equal(root.get("folderId"), folderId);
            if (subDividerId != null) spec = spec.and((root, query, cb) -> cb.equal(root.get("subDividerId"), subDividerId));
            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
                spec = spec.and((root, query, cb) -> cb.like(cb.lower(root.get("title")), like, '\\'));
            }
            if (!VIEW.in(folderRights)) {
                // Folder itself not visible: only documents individually shared with the caller.
                Set<UUID> shared = access.policy().grantedResourceIds(caller, AclEntry.ResourceType.DOCUMENT);
                if (shared.isEmpty()) throw ApiException.notFound("Folder").deniedOn("FOLDER", folderId);
                Set<UUID> ids = shared;
                spec = spec.and((root, query, cb) -> root.get("id").in(ids));
            }
            Page<Document> result = documents.findAll(spec, PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100),
                    Sort.by(Sort.Direction.DESC, "updatedAt")));
            Map<UUID, DocumentVersion> current = result.isEmpty() ? Map.of() : versions
                    .findCurrentFor(result.getContent().stream().map(Document::getId).toList())
                    .stream().collect(Collectors.toMap(DocumentVersion::getDocumentId, Function.identity()));
            return PagedResponse.of(result, d -> {
                DocumentVersion v = current.get(d.getId());
                int rights = eval.rights(cabinet, folder.lineage(), d.getId());
                return new DocumentSummary(d.getId(), d.getTitle(), d.getStatus(), d.getFolderId(), d.getSubDividerId(),
                        d.getDocumentTypeId(), d.getCurrentVersionNo(), v == null ? null : v.getOriginalFilename(),
                        v == null ? null : v.getContentType(), v == null ? 0 : v.getSizeBytes(), d.getUpdatedAt(),
                        lockHolder(d), rightNames(rights));
            });
        });
    }

    public DocumentDetail get(AppUserDetails caller, UUID documentId) {
        Document doc = load(documentId);
        requireRight(caller, doc, VIEW);
        return detail(caller, documentId);
    }

    /** A short-lived link to the binary; issued only after the DOWNLOAD check, and audited. */
    public DownloadLink downloadLink(AppUserDetails caller, UUID documentId, Integer versionNo, boolean inline) {
        Document doc = load(documentId);
        requireRight(caller, doc, DOWNLOAD);
        int no = versionNo == null ? doc.getCurrentVersionNo() : versionNo;
        DocumentVersion v = versions.findByDocumentIdAndVersionNo(documentId, no)
                .orElseThrow(() -> ApiException.notFound("Version"));
        switch (v.getProcessingStatus()) {
            case AVAILABLE -> { }
            case QUARANTINED -> throw ApiException.conflict("QUARANTINED",
                    "This version failed the security scan and cannot be downloaded");
            case FAILED -> throw ApiException.conflict("PROCESSING_FAILED",
                    "This version could not be security-scanned. An administrator can reprocess it.");
            case STORED, PROCESSING -> throw ApiException.conflict("PROCESSING",
                    "This version is still being security-scanned. Try again in a moment.");
        }
        Instant expires = clock.instant().plus(storageProps.downloadUrlTtl());
        String url = storage.presignedDownload(v.getStorageKey(), v.getOriginalFilename(), v.getContentType(),
                storageProps.downloadUrlTtl(), inline).toString();
        tx.executeWithoutResult(s -> audit.success(caller, inline ? "DOCUMENT_PREVIEWED" : "DOCUMENT_DOWNLOADED",
                "DOCUMENT", documentId, Map.of("versionNo", Integer.toString(no))));
        return new DownloadLink(url, expires, v.getOriginalFilename(), v.getContentType());
    }

    // ── Change ────────────────────────────────────────────────────────────

    public DocumentDetail update(AppUserDetails caller, UUID documentId, UpdateDocumentRequest req) {
        Document doc = load(documentId);
        requireRight(caller, doc, EDIT);
        List<MetadataService.Typed> typed = metadata.validate(req.documentTypeId(), req.metadata());
        tx.executeWithoutResult(s -> {
            Document locked = documents.findForUpdate(documentId).orElseThrow(() -> ApiException.notFound("Document"));
            ensureNotLockedByOther(locked, caller);
            if (req.entityVersion() != null && !Objects.equals(req.entityVersion(), locked.getVersion())) {
                throw ApiException.conflict("CONCURRENT_MODIFICATION",
                        "This document was changed by someone else. Reload and try again.");
            }
            Map<String, String> changes = new LinkedHashMap<>();
            if (!locked.getTitle().equals(req.title().trim())) changes.put("title", req.title().trim());
            if (!Objects.equals(locked.getDocumentTypeId(), req.documentTypeId())) {
                changes.put("documentTypeId", String.valueOf(req.documentTypeId()));
            }
            locked.retitle(req.title());
            locked.classify(req.documentTypeId());
            metadata.replace(documentId, typed);
            changes.put("metadataFields", Integer.toString(typed.size()));
            audit.success(caller, "DOCUMENT_UPDATED", "DOCUMENT", documentId, changes);
        });
        return detail(caller, documentId);
    }

    /** Check-out: exclusive editing lock for {@code lockDuration}; the holder can renew it. */
    public DocumentDetail checkOut(AppUserDetails caller, UUID documentId) {
        Document doc = load(documentId);
        requireRight(caller, doc, EDIT);
        tx.executeWithoutResult(s -> {
            Document locked = documents.findForUpdate(documentId).orElseThrow(() -> ApiException.notFound("Document"));
            ensureNotLockedByOther(locked, caller);
            Instant now = clock.instant();
            locked.lock(caller.userId(), now, now.plus(props.lockDuration()));
            audit.success(caller, "DOCUMENT_CHECKED_OUT", "DOCUMENT", documentId,
                    Map.of("until", locked.getLockExpiresAt().toString()));
        });
        return detail(caller, documentId);
    }

    /** Releases the lock. Someone else's lock needs DOCUMENTS_LOCK_OVERRIDE plus MANAGE on the document. */
    public DocumentDetail release(AppUserDetails caller, UUID documentId) {
        Document doc = load(documentId);
        int rights = rights(caller, doc);
        access.policy().requireVisible(rights, "Document");
        tx.executeWithoutResult(s -> {
            Document locked = documents.findForUpdate(documentId).orElseThrow(() -> ApiException.notFound("Document"));
            Instant now = clock.instant();
            if (locked.isLockedByOther(caller.userId(), now)) {
                if (!caller.has(Permission.DOCUMENTS_LOCK_OVERRIDE) || !MANAGE.in(rights)) {
                    throw ApiException.forbidden("Only the user who checked this document out, or an administrator, can release it");
                }
                UUID holder = locked.getLockedBy();
                locked.unlock();
                audit.success(caller, "DOCUMENT_LOCK_OVERRIDDEN", "DOCUMENT", documentId, Map.of("previousHolder", holder.toString()));
            } else if (locked.getLockedBy() != null) {
                locked.unlock();
                audit.success(caller, "DOCUMENT_CHECKED_IN", "DOCUMENT", documentId, null);
            }
        });
        return detail(caller, documentId);
    }

    /** Soft delete. Versions and binaries are retained for retention/legal-hold processing. */
    public void delete(AppUserDetails caller, UUID documentId) {
        Document doc = load(documentId);
        requireRight(caller, doc, DELETE);
        tx.executeWithoutResult(s -> {
            Document locked = documents.findForUpdate(documentId).orElseThrow(() -> ApiException.notFound("Document"));
            ensureNotLockedByOther(locked, caller);
            if (holds.isUnderActiveHold(documentId)) {
                throw ApiException.conflict("LEGAL_HOLD", "This document is under a legal hold and cannot be deleted");
            }
            locked.softDelete(caller.userId(), clock.instant());
            audit.success(caller, "DOCUMENT_DELETED", "DOCUMENT", documentId, Map.of("title", locked.getTitle()));
        });
    }

    // ── Internals ─────────────────────────────────────────────────────────

    /** Validates by content, then streams to storage while hashing. Outside any transaction. */
    private Stored store(UUID tenantId, UUID documentId, MultipartFile file) {
        if (file == null || file.isEmpty()) throw ApiException.badRequest("FILE_EMPTY", "Choose a file to upload");
        byte[] head;
        try (InputStream in = file.getInputStream()) {
            head = in.readNBytes(HEAD_BYTES);
        } catch (IOException e) {
            throw ApiException.badRequest("FILE_UNREADABLE", "The uploaded file could not be read");
        }
        FileInspector.Inspected inspected = FileInspector.inspect(file.getOriginalFilename(), head, file.getSize(),
                props.maxFileSizeBytes());
        String key = DocumentVersion.storageKey(tenantId, documentId);
        MessageDigest sha;
        try {
            sha = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
        try (InputStream in = new DigestInputStream(file.getInputStream(), sha)) {
            storage.put(key, in, file.getSize(), inspected.contentType());
        } catch (IOException e) {
            storage.deleteQuietly(key);
            throw ApiException.badRequest("FILE_UNREADABLE", "The uploaded file could not be read");
        }
        return new Stored(key, inspected.safeName(), inspected.contentType(), file.getSize(),
                HexFormat.of().formatHex(sha.digest()));
    }

    private Document load(UUID id) {
        return documents.findById(id).orElseThrow(() -> ApiException.notFound("Document"));
    }

    private int rights(AppUserDetails caller, Document doc) {
        return access.onDocument(caller, doc.getCabinetId(), access.folder(doc.getFolderId()), doc.getId());
    }

    private void requireRight(AppUserDetails caller, Document doc, ResourceRight right) {
        access.policy().require(rights(caller, doc), right, "Document", doc.getId());
    }

    /** Archived documents are read-only records (retention). */
    private static void ensureNotArchived(Document doc) {
        if (doc.isArchived()) {
            throw ApiException.conflict("ARCHIVED", "This document is archived and can no longer be changed");
        }
    }

    private void ensureNotLockedByOther(Document doc, AppUserDetails caller) {
        ensureNotArchived(doc);
        if (doc.isLockedByOther(caller.userId(), clock.instant())) {
            throw ApiException.conflict("DOCUMENT_LOCKED", "This document is checked out by another user until "
                    + doc.getLockExpiresAt());
        }
    }

    private UUID lockHolder(Document d) {
        return d.getLockExpiresAt() != null && d.getLockExpiresAt().isAfter(clock.instant()) ? d.getLockedBy() : null;
    }

    private List<UUID> visibleDuplicates(AppUserDetails caller, String sha256, UUID self) {
        return versions.findDocumentIdsWithContent(sha256, self).stream()
                .map(documents::findById)
                .flatMap(java.util.Optional::stream)
                .filter(d -> VIEW.in(rights(caller, d)))
                .map(Document::getId)
                .toList();
    }

    private DocumentDetail detail(AppUserDetails caller, UUID documentId) {
        return tx.execute(s -> {
            Document d = load(documentId);
            int rights = rights(caller, d);
            Instant now = clock.instant();
            LockView lock = lockHolder(d) == null ? null
                    : new LockView(d.getLockedBy(), d.getLockedAt(), d.getLockExpiresAt(), d.isLockedBy(caller.userId(), now));
            return new DocumentDetail(d.getId(), d.getTitle(), d.getStatus(), d.getCabinetId(), d.getFolderId(),
                    d.getSubDividerId(), d.getDocumentTypeId(), d.getCurrentVersionNo(), d.getOwnerId(), lock,
                    metadata.describe(d.getId(), d.getDocumentTypeId()),
                    versions.findByDocumentIdOrderByVersionNoDesc(d.getId()).stream().map(VersionView::of).toList(),
                    rightNames(rights), d.getVersion() == null ? 0 : d.getVersion(), holds.isUnderActiveHold(d.getId()),
                    d.getArchivedAt(), d.getCreatedAt(), d.getUpdatedAt());
        });
    }

    private static String stripExtension(String name) {
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }
}
