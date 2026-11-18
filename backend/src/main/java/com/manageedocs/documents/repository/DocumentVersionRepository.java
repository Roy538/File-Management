package com.manageedocs.documents.repository;

import com.manageedocs.documents.model.DocumentVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DocumentVersionRepository extends JpaRepository<DocumentVersion, UUID> {

    List<DocumentVersion> findByDocumentIdOrderByVersionNoDesc(UUID documentId);

    Optional<DocumentVersion> findByDocumentIdAndVersionNo(UUID documentId, int versionNo);

    /** The current version of each given document (one query per page of results). */
    @Query("""
            select v from DocumentVersion v, Document d
            where d.id = v.documentId and v.versionNo = d.currentVersionNo and d.id in :ids
            """)
    List<DocumentVersion> findCurrentFor(@Param("ids") java.util.Collection<UUID> documentIds);

    /** Other documents in this tenant whose content is byte-identical (duplicate detection). */
    @Query("select distinct v.documentId from DocumentVersion v where v.sha256 = :sha and v.documentId <> :excludeDocumentId")
    List<UUID> findDocumentIdsWithContent(@Param("sha") String sha256, @Param("excludeDocumentId") UUID excludeDocumentId);
}
