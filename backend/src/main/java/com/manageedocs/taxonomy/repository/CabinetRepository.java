package com.manageedocs.taxonomy.repository;

import com.manageedocs.taxonomy.model.Cabinet;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

/** Tenant-scoped by {@code @TenantId}; soft-deleted rows are excluded by {@code @SQLRestriction}. */
public interface CabinetRepository extends JpaRepository<Cabinet, UUID> {

    List<Cabinet> findAllByOrderByNameAsc();

    /** DEFAULT cabinets, cabinets the user owns, and any cabinet in {@code grantedIds}. */
    @Query("""
            select c from Cabinet c
            where c.visibility = com.manageedocs.taxonomy.model.Cabinet.Visibility.DEFAULT
               or c.ownerId = :userId
               or c.id in :grantedIds
            order by c.name
            """)
    List<Cabinet> findVisibleTo(@Param("userId") UUID userId, @Param("grantedIds") Collection<UUID> grantedIds);
}
