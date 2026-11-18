package com.manageedocs.search.repository;

import com.manageedocs.search.model.DocumentText;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface DocumentTextRepository extends JpaRepository<DocumentText, UUID> {

    List<DocumentText> findByDocumentVersionIdIn(Collection<UUID> versionIds);
}
