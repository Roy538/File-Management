package com.manageedocs.taxonomy.repository;

import com.manageedocs.taxonomy.model.SubDivider;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface SubDividerRepository extends JpaRepository<SubDivider, UUID> {

    List<SubDivider> findByFolderIdInOrderByNameAsc(Collection<UUID> folderIds);

    boolean existsByFolderId(UUID folderId);
}
