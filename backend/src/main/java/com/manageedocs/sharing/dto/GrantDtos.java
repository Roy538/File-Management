package com.manageedocs.sharing.dto;

import com.manageedocs.identity.model.Role;
import com.manageedocs.permissions.model.AclEntry;
import com.manageedocs.permissions.model.ResourceRight;
import jakarta.validation.constraints.NotEmpty;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public final class GrantDtos {

    private GrantDtos() {
    }

    /** Exactly one of {@code userId} / {@code role}. */
    public record GrantRequest(UUID userId, Role role, @NotEmpty Set<ResourceRight> rights) {
    }

    public record GrantView(UUID id, AclEntry.ResourceType resourceType, UUID resourceId, AclEntry.PrincipalType principalType,
                            UUID userId, Role role, List<String> rights, UUID grantedBy, Instant grantedAt) {
        public static GrantView of(AclEntry e) {
            return new GrantView(e.getId(), e.getResourceType(), e.getResourceId(), e.getPrincipalType(), e.getUserId(),
                    e.getRole(), ResourceRight.fromMask(e.getPermissions()).stream().map(r -> r.name().toLowerCase()).toList(),
                    e.getGrantedBy(), e.getCreatedAt());
        }
    }
}
