package com.manageedocs.workflows.repository;

import com.manageedocs.workflows.model.WorkflowDefinitionVersion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface WorkflowDefinitionVersionRepository extends JpaRepository<WorkflowDefinitionVersion, UUID> {

    Optional<WorkflowDefinitionVersion> findByDefinitionIdAndVersionNo(UUID definitionId, int versionNo);
}
