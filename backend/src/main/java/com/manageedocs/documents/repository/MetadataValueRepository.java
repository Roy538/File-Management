package com.manageedocs.documents.repository;

import com.manageedocs.documents.model.MetadataValue;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface MetadataValueRepository extends JpaRepository<MetadataValue, UUID> {

    List<MetadataValue> findByDocumentId(UUID documentId);

    @Modifying(flushAutomatically = true, clearAutomatically = false)
    @Query("delete from MetadataValue m where m.documentId = :documentId")
    int deleteForDocument(@Param("documentId") UUID documentId);
}
