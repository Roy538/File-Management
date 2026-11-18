package com.manageedocs.taxonomy.repository;

import com.manageedocs.taxonomy.model.MetadataField;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface MetadataFieldRepository extends JpaRepository<MetadataField, UUID> {

    List<MetadataField> findByDocumentTypeIdOrderBySortOrderAsc(UUID documentTypeId);

    List<MetadataField> findByDocumentTypeIdInOrderBySortOrderAsc(Collection<UUID> documentTypeIds);
}
