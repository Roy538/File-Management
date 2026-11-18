package com.manageedocs.workflows.repository;

import com.manageedocs.workflows.model.WorkflowEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface WorkflowEventRepository extends JpaRepository<WorkflowEvent, UUID> {

    List<WorkflowEvent> findByInstanceIdInOrderByOccurredAtAsc(Collection<UUID> instanceIds);
}
