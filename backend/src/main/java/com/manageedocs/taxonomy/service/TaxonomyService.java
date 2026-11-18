package com.manageedocs.taxonomy.service;

import com.manageedocs.audit.service.AuditService;
import com.manageedocs.documents.repository.DocumentRepository;
import com.manageedocs.exception.ApiException;
import com.manageedocs.permissions.model.AclEntry;
import com.manageedocs.permissions.service.AccessPolicy;
import com.manageedocs.security.AppUserDetails;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.CabinetTree;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.CabinetView;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.CreateCabinetRequest;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.CreateFolderRequest;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.FolderNode;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.FolderView;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.MoveFolderRequest;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.SubDividerView;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.UpdateCabinetRequest;
import com.manageedocs.taxonomy.model.Cabinet;
import com.manageedocs.taxonomy.model.Folder;
import com.manageedocs.taxonomy.model.SubDivider;
import com.manageedocs.taxonomy.repository.CabinetRepository;
import com.manageedocs.taxonomy.repository.FolderRepository;
import com.manageedocs.taxonomy.repository.SubDividerRepository;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static com.manageedocs.permissions.model.ResourceRight.MANAGE;
import static com.manageedocs.permissions.model.ResourceRight.VIEW;
import static com.manageedocs.taxonomy.dto.TaxonomyDtos.rightNames;

/** Cabinets → folders → sub-dividers: the filing structure (PinPoint-style hierarchy). */
@Service
public class TaxonomyService {

    private final CabinetRepository cabinets;
    private final FolderRepository folders;
    private final SubDividerRepository subDividers;
    private final DocumentRepository documents;
    private final TaxonomyAccess access;
    private final AuditService audit;
    private final EntityManager em;
    private final Clock clock;

    public TaxonomyService(CabinetRepository cabinets, FolderRepository folders, SubDividerRepository subDividers,
                           DocumentRepository documents, TaxonomyAccess access, AuditService audit,
                           EntityManager em, Clock clock) {
        this.cabinets = cabinets;
        this.folders = folders;
        this.subDividers = subDividers;
        this.documents = documents;
        this.access = access;
        this.audit = audit;
        this.em = em;
        this.clock = clock;
    }

    // ── Cabinets ──────────────────────────────────────────────────────────

    /** Cabinets the caller can see, or that contain something shared with them, optionally by visibility. */
    @Transactional(readOnly = true)
    public List<CabinetView> listCabinets(AppUserDetails caller, Cabinet.Visibility scope) {
        AccessPolicy.Evaluator eval = access.policy().evaluator(caller);
        List<Cabinet> candidates;
        Set<UUID> navigable = new HashSet<>();
        if (caller.isAdmin()) {
            candidates = cabinets.findAllByOrderByNameAsc();
        } else {
            Set<UUID> granted = new HashSet<>(access.policy().grantedResourceIds(caller, AclEntry.ResourceType.CABINET));
            Set<UUID> grantedFolders = access.policy().grantedResourceIds(caller, AclEntry.ResourceType.FOLDER);
            if (!grantedFolders.isEmpty()) navigable.addAll(folders.findCabinetIds(grantedFolders));
            Set<UUID> grantedDocs = access.policy().grantedResourceIds(caller, AclEntry.ResourceType.DOCUMENT);
            for (UUID docId : grantedDocs) documents.findById(docId).ifPresent(d -> navigable.add(d.getCabinetId()));
            granted.addAll(navigable);
            candidates = cabinets.findVisibleTo(caller.userId(), AccessPolicy.nonEmpty(granted));
        }
        return candidates.stream()
                .filter(c -> scope == null || c.getVisibility() == scope)
                .map(c -> new CabinetView(c.getId(), c.getName(), c.getDescription(), c.getVisibility(), c.getOwnerId(),
                        rightNames(eval.rights(c, List.of(), null))))
                .filter(v -> v.rights().contains("view") || navigable.contains(v.id()))
                .toList();
    }

    @Transactional
    public CabinetView createCabinet(AppUserDetails caller, CreateCabinetRequest req) {
        if (req.visibility() == Cabinet.Visibility.DEFAULT && !caller.isAdmin()) {
            throw ApiException.forbidden("Only administrators can create organisation-wide cabinets");
        }
        UUID owner = req.visibility() == Cabinet.Visibility.DEFAULT ? null : caller.userId();
        Cabinet c = cabinets.save(new Cabinet(req.name(), req.description(), req.visibility(), owner));
        audit.success(caller, "CABINET_CREATED", "CABINET", c.getId(),
                Map.of("name", c.getName(), "visibility", c.getVisibility().name()));
        return view(caller, c);
    }

    @Transactional(readOnly = true)
    public CabinetTree tree(AppUserDetails caller, UUID cabinetId) {
        Cabinet c = access.cabinet(cabinetId);
        AccessPolicy.Evaluator eval = access.policy().evaluator(caller);
        int cabinetRights = eval.rights(c, List.of(), null);
        List<Folder> all = folders.findByCabinetIdOrderByPathAsc(cabinetId);
        Map<UUID, Integer> rights = all.stream()
                .collect(Collectors.toMap(Folder::getId, f -> eval.rights(c, f.lineage(), null)));
        List<Folder> visible = all.stream().filter(f -> VIEW.in(rights.get(f.getId()))).toList();
        if (!VIEW.in(cabinetRights) && visible.isEmpty()) {
            throw ApiException.notFound("Cabinet").deniedOn("CABINET", cabinetId);
        }

        Map<UUID, List<SubDividerView>> subs = subDividers
                .findByFolderIdInOrderByNameAsc(AccessPolicy.nonEmpty(visible.stream().map(Folder::getId).toList()))
                .stream().collect(Collectors.groupingBy(SubDivider::getFolderId,
                        Collectors.mapping(s -> new SubDividerView(s.getId(), s.getFolderId(), s.getName()), Collectors.toList())));
        Set<UUID> visibleIds = visible.stream().map(Folder::getId).collect(Collectors.toSet());
        List<FolderNode> nodes = new ArrayList<>();
        for (Folder f : visible) {
            // A parent the caller cannot see is not revealed: the folder is presented as a root.
            UUID parent = f.getParentId() != null && visibleIds.contains(f.getParentId()) ? f.getParentId() : null;
            nodes.add(new FolderNode(f.getId(), parent, f.getName(), f.getDepth(),
                    subs.getOrDefault(f.getId(), List.of()), rightNames(rights.get(f.getId()))));
        }
        nodes.sort((a, b) -> a.name().compareToIgnoreCase(b.name()));
        return new CabinetTree(new CabinetView(c.getId(), c.getName(), c.getDescription(), c.getVisibility(),
                c.getOwnerId(), rightNames(cabinetRights)), nodes);
    }

    @Transactional
    public CabinetView updateCabinet(AppUserDetails caller, UUID id, UpdateCabinetRequest req) {
        Cabinet c = access.requireCabinet(caller, id, MANAGE);
        c.rename(req.name());
        c.describe(req.description());
        audit.success(caller, "CABINET_UPDATED", "CABINET", id, Map.of("name", c.getName()));
        return view(caller, c);
    }

    @Transactional
    public void deleteCabinet(AppUserDetails caller, UUID id) {
        Cabinet c = access.requireCabinet(caller, id, MANAGE);
        if (folders.existsByCabinetId(id)) {
            throw ApiException.conflict("CABINET_NOT_EMPTY", "Remove or move this cabinet's folders first");
        }
        c.softDelete(clock.instant());
        audit.success(caller, "CABINET_DELETED", "CABINET", id, Map.of("name", c.getName()));
    }

    // ── Folders ───────────────────────────────────────────────────────────

    @Transactional
    public FolderView createFolder(AppUserDetails caller, UUID cabinetId, CreateFolderRequest req) {
        Folder folder;
        if (req.parentId() == null) {
            access.requireCabinet(caller, cabinetId, MANAGE);
            folder = Folder.root(cabinetId, req.name());
        } else {
            Folder parent = access.requireFolder(caller, req.parentId(), MANAGE);
            if (!parent.getCabinetId().equals(cabinetId)) throw ApiException.notFound("Folder");
            folder = Folder.childOf(parent, req.name());
        }
        folders.save(folder);
        audit.success(caller, "FOLDER_CREATED", "FOLDER", folder.getId(),
                Map.of("name", folder.getName(), "cabinetId", cabinetId.toString()));
        return folderView(caller, folder);
    }

    @Transactional
    public FolderView renameFolder(AppUserDetails caller, UUID folderId, String name) {
        Folder f = access.requireFolder(caller, folderId, MANAGE);
        String old = f.getName();
        f.rename(name);
        audit.success(caller, "FOLDER_RENAMED", "FOLDER", folderId, Map.of("from", old, "to", f.getName()));
        return folderView(caller, f);
    }

    /**
     * Re-parents a folder (optionally into another cabinet). Rejects moving a folder into itself or
     * its own subtree; rewrites the materialised path of every descendant and the denormalised
     * cabinet of every document in the subtree, in one transaction.
     */
    @Transactional
    public FolderView moveFolder(AppUserDetails caller, UUID folderId, MoveFolderRequest req) {
        Folder moving = access.requireFolder(caller, folderId, MANAGE);
        Folder newParent = null;
        UUID targetCabinet;
        if (req.targetParentId() != null) {
            newParent = access.requireFolder(caller, req.targetParentId(), MANAGE);
            if (moving.contains(newParent)) {
                throw ApiException.badRequest("INVALID_MOVE", "A folder cannot be moved into itself or its own subfolders");
            }
            targetCabinet = newParent.getCabinetId();
        } else if (req.targetCabinetId() != null) {
            access.requireCabinet(caller, req.targetCabinetId(), MANAGE);
            targetCabinet = req.targetCabinetId();
        } else {
            throw ApiException.badRequest("INVALID_MOVE", "Give a target folder or cabinet");
        }
        UUID fromCabinet = moving.getCabinetId();
        List<Folder> subtree = folders.findSubtree(moving.getPath());
        String oldPrefix = moving.moveTo(targetCabinet, newParent);
        if (moving.getDepth() > Folder.MAX_DEPTH) throw ApiException.badRequest("INVALID_MOVE", "Move would exceed the maximum folder depth");
        for (Folder d : subtree) {
            if (!d.getId().equals(moving.getId())) d.rebase(oldPrefix, moving);
        }
        if (!fromCabinet.equals(targetCabinet)) {
            List<UUID> ids = subtree.stream().map(Folder::getId).toList();
            em.createQuery("update Document d set d.cabinetId = :c where d.folderId in :ids")
                    .setParameter("c", targetCabinet).setParameter("ids", ids).executeUpdate();
        }
        audit.success(caller, "FOLDER_MOVED", "FOLDER", folderId, Map.of(
                "fromCabinet", fromCabinet.toString(), "toCabinet", targetCabinet.toString(),
                "toParent", req.targetParentId() == null ? "" : req.targetParentId().toString(),
                "subtreeSize", Integer.toString(subtree.size())));
        return folderView(caller, moving);
    }

    @Transactional
    public void deleteFolder(AppUserDetails caller, UUID folderId) {
        Folder f = access.requireFolder(caller, folderId, MANAGE);
        if (folders.existsByParentId(folderId) || subDividers.existsByFolderId(folderId) || documents.existsByFolderId(folderId)) {
            throw ApiException.conflict("FOLDER_NOT_EMPTY", "Remove this folder's subfolders, sub-dividers and documents first");
        }
        f.softDelete(clock.instant());
        audit.success(caller, "FOLDER_DELETED", "FOLDER", folderId, Map.of("name", f.getName()));
    }

    // ── Sub-dividers ──────────────────────────────────────────────────────

    @Transactional
    public SubDividerView createSubDivider(AppUserDetails caller, UUID folderId, String name) {
        access.requireFolder(caller, folderId, MANAGE);
        SubDivider s = subDividers.save(new SubDivider(folderId, name));
        audit.success(caller, "SUBDIVIDER_CREATED", "SUB_DIVIDER", s.getId(), Map.of("name", s.getName()));
        return new SubDividerView(s.getId(), folderId, s.getName());
    }

    @Transactional
    public SubDividerView renameSubDivider(AppUserDetails caller, UUID id, String name) {
        SubDivider s = subDivider(id);
        access.requireFolder(caller, s.getFolderId(), MANAGE);
        s.rename(name);
        audit.success(caller, "SUBDIVIDER_RENAMED", "SUB_DIVIDER", id, Map.of("name", s.getName()));
        return new SubDividerView(s.getId(), s.getFolderId(), s.getName());
    }

    @Transactional
    public void deleteSubDivider(AppUserDetails caller, UUID id) {
        SubDivider s = subDivider(id);
        access.requireFolder(caller, s.getFolderId(), MANAGE);
        if (documents.existsBySubDividerId(id)) {
            throw ApiException.conflict("SUBDIVIDER_NOT_EMPTY", "Move or delete this sub-divider's documents first");
        }
        s.softDelete(clock.instant());
        audit.success(caller, "SUBDIVIDER_DELETED", "SUB_DIVIDER", id, Map.of("name", s.getName()));
    }

    private SubDivider subDivider(UUID id) {
        return subDividers.findById(id).orElseThrow(() -> ApiException.notFound("Sub-divider"));
    }

    private CabinetView view(AppUserDetails caller, Cabinet c) {
        return new CabinetView(c.getId(), c.getName(), c.getDescription(), c.getVisibility(), c.getOwnerId(),
                rightNames(access.onCabinet(caller, c)));
    }

    private FolderView folderView(AppUserDetails caller, Folder f) {
        return new FolderView(f.getId(), f.getCabinetId(), f.getParentId(), f.getName(), f.getDepth(),
                rightNames(access.onFolder(caller, f)));
    }
}
