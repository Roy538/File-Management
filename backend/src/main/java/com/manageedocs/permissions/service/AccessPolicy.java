package com.manageedocs.permissions.service;

import com.manageedocs.exception.ApiException;
import com.manageedocs.identity.model.Role;
import com.manageedocs.permissions.model.AclEntry;
import com.manageedocs.permissions.model.ResourceRight;
import com.manageedocs.permissions.repository.AclEntryRepository;
import com.manageedocs.security.AppUserDetails;
import com.manageedocs.security.Permission;
import com.manageedocs.taxonomy.model.Cabinet;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static com.manageedocs.permissions.model.ResourceRight.*;

/**
 * The single decision point for object-level access (layer 2; layer 1 is {@code @PreAuthorize}).
 *
 * <pre>
 * rights = baseline(cabinet visibility, role, ownership)
 *        ∪ grants on the cabinet ∪ grants on every ancestor folder ∪ grants on the document
 *        ∩ what the caller's capabilities allow (a DENY override really removes the ability)
 * </pre>
 * Tenant isolation is already guaranteed beneath this by Hibernate {@code @TenantId}: objects from
 * another organisation cannot even be loaded. Callers turn "no VIEW" into 404, never 403.
 */
@Service
public class AccessPolicy {

    private final AclEntryRepository acl;

    public AccessPolicy(AclEntryRepository acl) {
        this.acl = acl;
    }

    /**
     * Effective rights bitmask.
     *
     * @param folderLineage ids of the folder and its ancestors (empty for cabinet-level checks)
     * @param documentId    the document, or null for folder/cabinet-level checks
     */
    public int rights(AppUserDetails caller, Cabinet cabinet, List<UUID> folderLineage, UUID documentId) {
        int mask = baseline(caller, cabinet);
        if (mask != ResourceRight.FULL) {
            List<UUID> ids = new ArrayList<>(folderLineage.size() + 2);
            ids.add(cabinet.getId());
            ids.addAll(folderLineage);
            if (documentId != null) ids.add(documentId);
            for (AclEntry g : acl.findApplicable(ids, caller.userId(), caller.role())) {
                mask |= g.getPermissions();
            }
        }
        return mask & capabilityCeiling(caller);
    }

    /**
     * Preloads every grant the caller holds (one query), for evaluating many objects at once —
     * a folder tree, a page of documents. Use within one request only.
     */
    public Evaluator evaluator(AppUserDetails caller) {
        return new Evaluator(caller, acl.findAllForPrincipal(caller.userId(), caller.role()));
    }

    public final class Evaluator {
        private final AppUserDetails caller;
        private final java.util.Map<UUID, Integer> grantsByResource = new java.util.HashMap<>();

        private Evaluator(AppUserDetails caller, List<AclEntry> grants) {
            this.caller = caller;
            for (AclEntry g : grants) grantsByResource.merge(g.getResourceId(), g.getPermissions(), (a, b) -> a | b);
        }

        public int rights(Cabinet cabinet, List<UUID> folderLineage, UUID documentId) {
            int mask = baseline(caller, cabinet) | grantsByResource.getOrDefault(cabinet.getId(), 0);
            for (UUID f : folderLineage) mask |= grantsByResource.getOrDefault(f, 0);
            if (documentId != null) mask |= grantsByResource.getOrDefault(documentId, 0);
            return mask & capabilityCeiling(caller);
        }

        public boolean hasGrantOn(UUID resourceId) {
            return grantsByResource.containsKey(resourceId);
        }
    }

    /**
     * Throws 404 when the object is not visible at all, 403 when visible but {@code needed} is missing.
     * Either way the failure is flagged so the exception handler records an ACCESS_DENIED audit event.
     */
    public void require(int rights, ResourceRight needed, String what, Object resourceId) {
        if (!VIEW.in(rights)) throw ApiException.notFound(what).deniedOn(what.toUpperCase().replace('-', '_'), resourceId);
        if (!needed.in(rights)) {
            throw ApiException.forbidden("You do not have " + needed.name().toLowerCase() + " access to this " + what.toLowerCase())
                    .deniedOn(what.toUpperCase().replace('-', '_'), resourceId);
        }
    }

    public void requireVisible(int rights, String what) {
        if (!VIEW.in(rights)) throw ApiException.notFound(what);
    }

    /** Ids of cabinets/folders/documents on which this caller holds any grant (for discovery). */
    public Set<UUID> grantedResourceIds(AppUserDetails caller, AclEntry.ResourceType type) {
        Set<UUID> ids = new HashSet<>();
        for (AclEntry g : acl.findAllForPrincipal(caller.userId(), caller.role())) {
            if (g.getResourceType() == type && VIEW.in(g.getPermissions())) ids.add(g.getResourceId());
        }
        return ids;
    }

    /** Rights before any grant: from visibility, ownership and role. */
    int baseline(AppUserDetails caller, Cabinet cabinet) {
        if (caller.isAdmin()) return FULL;                                  // records oversight
        if (caller.userId().equals(cabinet.getOwnerId())) return FULL;
        return switch (cabinet.getVisibility()) {
            case DEFAULT -> roleBaseline(caller.role());
            case PRIVATE, PERSONAL -> 0;                                      // grants only
        };
    }

    static int roleBaseline(Role role) {
        return switch (role) {
            case SUPER_ADMIN, ADMIN -> FULL;
            // Records officers file documents and maintain folder structure in organisational cabinets.
            case OFFICER -> CONTRIBUTE | MANAGE.bit();
            case DEPT_USER -> READ;
        };
    }

    /** Capabilities cap what grants can confer: no DOCUMENTS_DOWNLOAD capability, no download anywhere. */
    static int capabilityCeiling(AppUserDetails c) {
        int m = 0;
        if (c.has(Permission.DOCUMENTS_VIEW) || c.has(Permission.CABINETS_VIEW)) m |= VIEW.bit();
        if (c.has(Permission.DOCUMENTS_DOWNLOAD)) m |= DOWNLOAD.bit();
        if (c.has(Permission.DOCUMENTS_UPLOAD)) m |= UPLOAD.bit();
        if (c.has(Permission.DOCUMENTS_EDIT)) m |= EDIT.bit();
        if (c.has(Permission.DOCUMENTS_DELETE)) m |= DELETE.bit();
        if (c.has(Permission.ACCESS_MANAGE)) m |= SHARE.bit();
        if (c.has(Permission.CABINETS_MANAGE) || c.has(Permission.ACCESS_MANAGE)) m |= MANAGE.bit();
        return m;
    }

    /** Hibernate renders an empty IN list inconsistently across versions; never pass one. */
    public static Collection<UUID> nonEmpty(Collection<UUID> ids) {
        return ids.isEmpty() ? List.of(new UUID(0, 0)) : ids;
    }
}
