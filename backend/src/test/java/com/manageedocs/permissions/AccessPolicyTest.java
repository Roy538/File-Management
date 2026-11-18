package com.manageedocs.permissions;

import com.manageedocs.exception.ApiException;
import com.manageedocs.identity.model.Role;
import com.manageedocs.permissions.model.AclEntry;
import com.manageedocs.permissions.model.ResourceRight;
import com.manageedocs.permissions.repository.AclEntryRepository;
import com.manageedocs.permissions.service.AccessPolicy;
import com.manageedocs.security.AppUserDetails;
import com.manageedocs.security.Permission;
import com.manageedocs.security.RoleDefaults;
import com.manageedocs.taxonomy.model.Cabinet;
import org.junit.jupiter.api.Test;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static com.manageedocs.permissions.model.ResourceRight.DOWNLOAD;
import static com.manageedocs.permissions.model.ResourceRight.EDIT;
import static com.manageedocs.permissions.model.ResourceRight.MANAGE;
import static com.manageedocs.permissions.model.ResourceRight.UPLOAD;
import static com.manageedocs.permissions.model.ResourceRight.VIEW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AccessPolicyTest {

    private final AclEntryRepository acl = mock(AclEntryRepository.class);
    private final AccessPolicy policy = new AccessPolicy(acl);
    private final UUID tenant = UUID.randomUUID();

    private AppUserDetails user(Role role) {
        return user(role, RoleDefaults.forRole(role));
    }

    private AppUserDetails user(Role role, Set<Permission> perms) {
        return new AppUserDetails(UUID.randomUUID(), tenant, "u@x", "U X", role, perms);
    }

    @Test
    void defaultCabinetRightsFollowTheRole() {
        when(acl.findApplicable(any(), any(), any())).thenReturn(List.of());
        Cabinet c = new Cabinet("Policies", null, Cabinet.Visibility.DEFAULT, null);
        assertThat(ResourceRight.fromMask(policy.rights(user(Role.DEPT_USER), c, List.of(), null)))
                .containsExactlyInAnyOrder(VIEW, DOWNLOAD);
        assertThat(ResourceRight.fromMask(policy.rights(user(Role.OFFICER), c, List.of(), null)))
                .containsExactlyInAnyOrder(VIEW, DOWNLOAD, UPLOAD, EDIT, MANAGE);
        assertThat(policy.rights(user(Role.ADMIN), c, List.of(), null)).isEqualTo(ResourceRight.FULL);
    }

    @Test
    void privateAndPersonalCabinetsGiveNothingWithoutOwnershipOrGrant() {
        when(acl.findApplicable(any(), any(), any())).thenReturn(List.of());
        AppUserDetails owner = user(Role.OFFICER);
        Cabinet personal = new Cabinet("Mine", null, Cabinet.Visibility.PERSONAL, owner.userId());
        assertThat(policy.rights(user(Role.OFFICER), personal, List.of(), null)).isZero();
        assertThat(VIEW.in(policy.rights(owner, personal, List.of(), null))).isTrue();
    }

    @Test
    void grantsOnAncestorFoldersAreInheritedButCappedByCapabilities() {
        AppUserDetails reader = user(Role.DEPT_USER);
        UUID folder = UUID.randomUUID();
        when(acl.findApplicable(any(), any(), any())).thenReturn(List.of(
                AclEntry.forUser(AclEntry.ResourceType.FOLDER, folder, reader.userId(), ResourceRight.FULL, null)));
        Cabinet c = new Cabinet("Board", null, Cabinet.Visibility.PRIVATE, UUID.randomUUID());
        // A FULL grant still cannot exceed a department user's capabilities (no upload/edit/delete).
        assertThat(ResourceRight.fromMask(policy.rights(reader, c, List.of(folder), UUID.randomUUID())))
                .containsExactlyInAnyOrder(VIEW, DOWNLOAD);
        // A denied capability removes the right even for administrators.
        AppUserDetails restrictedAdmin = user(Role.ADMIN, EnumSet.of(Permission.DOCUMENTS_VIEW));
        assertThat(ResourceRight.fromMask(policy.rights(restrictedAdmin, c, List.of(), null))).containsExactly(VIEW);
    }

    @Test
    void invisibleIsNotFoundAndVisibleButNotAllowedIsForbidden() {
        assertThatThrownBy(() -> policy.require(0, EDIT, "Document", UUID.randomUUID()))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.status().value()).isEqualTo(404);
                    assertThat(e.isAccessDenial()).isTrue();
                });
        assertThatThrownBy(() -> policy.require(VIEW.bit(), EDIT, "Document", UUID.randomUUID()))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status().value()).isEqualTo(403));
    }
}
