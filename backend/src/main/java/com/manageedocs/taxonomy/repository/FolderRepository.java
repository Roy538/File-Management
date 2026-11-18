package com.manageedocs.taxonomy.repository;

import com.manageedocs.taxonomy.model.Folder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface FolderRepository extends JpaRepository<Folder, UUID> {

    List<Folder> findByCabinetIdOrderByPathAsc(UUID cabinetId);

    /** The folder and everything beneath it (materialised-path prefix match). */
    @Query("select f from Folder f where f.path like concat(:path, '%') order by f.depth")
    List<Folder> findSubtree(@Param("path") String path);

    @Query("select f.cabinetId from Folder f where f.id in :ids")
    List<UUID> findCabinetIds(@Param("ids") Collection<UUID> ids);

    boolean existsByParentId(UUID parentId);

    boolean existsByCabinetId(UUID cabinetId);
}
