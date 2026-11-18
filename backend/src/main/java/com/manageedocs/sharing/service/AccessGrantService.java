package com.manageedocs.sharing.service;

import com.manageedocs.audit.service.AuditService;
import com.manageedocs.documents.model.Document;
import com.manageedocs.documents.repository.DocumentRepository;
import com.manageedocs.exception.ApiException;
import com.manageedocs.identity.model.Role;
import com.manageedocs.identity.repository.UserRepository;
import com.manageedocs.permissions.model.AclEntry;
import com.manageedocs.permissions.model.ResourceRight;
import com.manageedocs.permissions.repository.AclEntryRepository;
import com.manageedocs.security.AppUserDetails;
import com.manageedocs.sharing.dto.GrantDtos.GrantRequest;
import com.manageedocs.sharing.dto.GrantDtos.GrantView;
import com.manageedocs.taxonomy.service.TaxonomyAccess;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Grants on cabinets, folders and documents. Rules: the caller needs MANAGE on the resource, and
 * cannot grant rights they do not hold on it themselves (no privilege escalation through sharing).
 * Grantees must belong to the caller's organisation (enforced by the tenant-scoped user lookup).
 */
@Service
public class AccessGrantService {

    private final AclEntryRepository acl;
    private final TaxonomyAccess access;
    private final DocumentRepository documents;
    private final UserRepository users;
    private final AuditService audit;

    public AccessGrantService(AclEntryRepository acl, TaxonomyAccess access, DocumentRepository documents,
                              UserRepository users, AuditService audit) {
        this.acl = acl;
        this.access = access;
        this.documents = documents;
        this.users = users;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<GrantView> list(AppUserDetails caller, AclEntry.ResourceType type, UUID resourceId) {
        requireManage(caller, type, resourceId);
        return acl.findByResourceTypeAndResourceId(type, resourceId).stream().map(GrantView::of).toList();
    }

    @Transactional
    public GrantView grant(AppUserDetails caller, AclEntry.ResourceType type, UUID resourceId, GrantRequest req) {
        int callerRights = requireManage(caller, type, resourceId);
        if ((req.userId() == null) == (req.role() == null)) {
            throw new IllegalArgumentException("Grant to exactly one of a user or a role");
        }
        if (req.role() == Role.SUPER_ADMIN) throw new IllegalArgumentException("Cannot grant to the platform role");
        int mask = ResourceRight.toMask(req.rights()) | ResourceRight.VIEW.bit();   // every grant implies view
        if ((mask & ~callerRights) != 0) {
            throw ApiException.forbidden("You cannot grant rights you do not hold on this " + type.name().toLowerCase());
        }
        if (req.userId() != null && users.findById(req.userId()).isEmpty()) throw ApiException.notFound("User");

        AclEntry entry = req.userId() != null
                ? AclEntry.forUser(type, resourceId, req.userId(), mask, caller.userId())
                : AclEntry.forRole(type, resourceId, req.role(), mask, caller.userId());
        acl.save(entry);
        audit.success(caller, "ACCESS_GRANTED", type.name(), resourceId, Map.of(
                "principal", req.userId() != null ? "user:" + req.userId() : "role:" + req.role(),
                "rights", ResourceRight.fromMask(mask).toString()));
        return GrantView.of(entry);
    }

    @Transactional
    public void revoke(AppUserDetails caller, UUID grantId) {
        AclEntry entry = acl.findById(grantId).orElseThrow(() -> ApiException.notFound("Grant"));
        requireManage(caller, entry.getResourceType(), entry.getResourceId());
        acl.delete(entry);
        audit.success(caller, "ACCESS_REVOKED", entry.getResourceType().name(), entry.getResourceId(), Map.of(
                "principal", entry.getUserId() != null ? "user:" + entry.getUserId() : "role:" + entry.getRole()));
    }

    private int requireManage(AppUserDetails caller, AclEntry.ResourceType type, UUID resourceId) {
        int rights = switch (type) {
            case CABINET -> access.onCabinet(caller, access.cabinet(resourceId));
            case FOLDER -> access.onFolder(caller, access.folder(resourceId));
            case DOCUMENT -> {
                Document d = documents.findById(resourceId).orElseThrow(() -> ApiException.notFound("Document"));
                yield access.onDocument(caller, d.getCabinetId(), access.folder(d.getFolderId()), d.getId());
            }
        };
        access.policy().require(rights, ResourceRight.MANAGE, type.name().charAt(0) + type.name().substring(1).toLowerCase(), resourceId);
        return rights;
    }
}
