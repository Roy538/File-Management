package com.manageedocs.workflows.repository;

import com.manageedocs.workflows.model.WorkflowDefinition;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface WorkflowDefinitionRepository extends JpaRepository<WorkflowDefinition, UUID> {

    List<WorkflowDefinition> findAllByOrderByNameAsc();

    boolean existsByNameIgnoreCase(String name);
}
