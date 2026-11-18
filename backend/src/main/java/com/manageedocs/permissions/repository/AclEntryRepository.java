package com.manageedocs.permissions.repository;

import com.manageedocs.permissions.model.AclEntry;

import com.manageedocs.identity.model.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface AclEntryRepository extends JpaRepository<AclEntry, UUID> {

    /** All grants that apply to this user (directly or via role) on any of the given resources. */
    @Query("""
            select a from AclEntry a
            where a.resourceId in :resourceIds
              and (a.userId = :userId or a.role = :role)
            """)
    List<AclEntry> findApplicable(@Param("resourceIds") Collection<UUID> resourceIds,
                                  @Param("userId") UUID userId, @Param("role") Role role);

    /** Every grant held by this user (directly or via role) — used to discover shared items. */
    @Query("select a from AclEntry a where a.userId = :userId or a.role = :role")
    List<AclEntry> findAllForPrincipal(@Param("userId") UUID userId, @Param("role") Role role);

    List<AclEntry> findByResourceTypeAndResourceId(AclEntry.ResourceType type, UUID resourceId);

    @Modifying
    @Query("delete from AclEntry a where a.resourceType = :type and a.resourceId = :resourceId")
    int deleteForResource(@Param("type") AclEntry.ResourceType type, @Param("resourceId") UUID resourceId);
}
