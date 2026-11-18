package com.manageedocs.taxonomy.repository;

import com.manageedocs.taxonomy.model.DocumentType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface DocumentTypeRepository extends JpaRepository<DocumentType, UUID> {

    List<DocumentType> findByActiveTrueOrderByNameAsc();

    boolean existsByNameIgnoreCase(String name);
}
