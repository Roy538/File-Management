package com.manageedocs.documents.repository;

import com.manageedocs.documents.model.Document;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DocumentRepository extends JpaRepository<Document, UUID>, JpaSpecificationExecutor<Document> {

    /** Row lock for version creation, check-out and delete: serialises writers on one document. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from Document d where d.id = :id")
    Optional<Document> findForUpdate(@Param("id") UUID id);

    Page<Document> findByFolderIdAndIdIn(UUID folderId, Collection<UUID> ids, Pageable pageable);

    boolean existsByFolderId(UUID folderId);

    boolean existsBySubDividerId(UUID subDividerId);

    @Query("select d.id from Document d where d.id in :ids")
    List<UUID> findExistingIds(@Param("ids") Collection<UUID> ids);
}
