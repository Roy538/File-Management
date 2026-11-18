package com.manageedocs.retention.repository;

import com.manageedocs.retention.model.LegalHoldDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface LegalHoldDocumentRepository extends JpaRepository<LegalHoldDocument, LegalHoldDocument.Key> {

    @Query("select i from LegalHoldDocument i where i.id.legalHoldId = :holdId order by i.addedAt desc")
    List<LegalHoldDocument> findByHold(@Param("holdId") UUID holdId);

    /** Whether the document is covered by at least one hold that has not been released. */
    @Query("""
            select count(i) > 0 from LegalHoldDocument i, LegalHold h
            where h.id = i.id.legalHoldId and h.releasedAt is null and i.id.documentId = :documentId
            """)
    boolean isUnderActiveHold(@Param("documentId") UUID documentId);

    @Query("""
            select distinct i.id.documentId from LegalHoldDocument i, LegalHold h
            where h.id = i.id.legalHoldId and h.releasedAt is null and i.id.documentId in :documentIds
            """)
    List<UUID> findHeld(@Param("documentIds") Collection<UUID> documentIds);
}
