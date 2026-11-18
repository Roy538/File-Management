package com.manageedocs.workflows.repository;

import com.manageedocs.workflows.model.WorkflowStep;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface WorkflowStepRepository extends JpaRepository<WorkflowStep, UUID> {

    List<WorkflowStep> findByDefinitionVersionIdOrderByStepOrderAsc(UUID definitionVersionId);
}
