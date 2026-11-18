package com.manageedocs.taxonomy.service;

import com.manageedocs.exception.ApiException;
import com.manageedocs.permissions.model.ResourceRight;
import com.manageedocs.permissions.service.AccessPolicy;
import com.manageedocs.security.AppUserDetails;
import com.manageedocs.taxonomy.model.Cabinet;
import com.manageedocs.taxonomy.model.Folder;
import com.manageedocs.taxonomy.repository.CabinetRepository;
import com.manageedocs.taxonomy.repository.FolderRepository;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Loads cabinets/folders (tenant-scoped, so other organisations' ids simply do not resolve) and
 * computes the caller's rights on them. Used by the taxonomy and document services alike so the
 * "can I see / change this?" answer is computed one way everywhere.
 */
@Component
public class TaxonomyAccess {

    private final CabinetRepository cabinets;
    private final FolderRepository folders;
    private final AccessPolicy policy;

    public TaxonomyAccess(CabinetRepository cabinets, FolderRepository folders, AccessPolicy policy) {
        this.cabinets = cabinets;
        this.folders = folders;
        this.policy = policy;
    }

    public Cabinet cabinet(UUID id) {
        return cabinets.findById(id).orElseThrow(() -> ApiException.notFound("Cabinet"));
    }

    public Folder folder(UUID id) {
        return folders.findById(id).orElseThrow(() -> ApiException.notFound("Folder"));
    }

    public int onCabinet(AppUserDetails caller, Cabinet cabinet) {
        return policy.rights(caller, cabinet, List.of(), null);
    }

    public int onFolder(AppUserDetails caller, Folder folder) {
        return policy.rights(caller, cabinet(folder.getCabinetId()), folder.lineage(), null);
    }

    public int onDocument(AppUserDetails caller, UUID cabinetId, Folder folder, UUID documentId) {
        return policy.rights(caller, cabinet(cabinetId), folder.lineage(), documentId);
    }

    /** Loads the folder and requires {@code right} on it (404 if invisible, 403 if visible but not allowed). */
    public Folder requireFolder(AppUserDetails caller, UUID folderId, ResourceRight right) {
        Folder f = folder(folderId);
        policy.require(onFolder(caller, f), right, "Folder", f.getId());
        return f;
    }

    public Cabinet requireCabinet(AppUserDetails caller, UUID cabinetId, ResourceRight right) {
        Cabinet c = cabinet(cabinetId);
        policy.require(onCabinet(caller, c), right, "Cabinet", c.getId());
        return c;
    }

    public AccessPolicy policy() {
        return policy;
    }
}
