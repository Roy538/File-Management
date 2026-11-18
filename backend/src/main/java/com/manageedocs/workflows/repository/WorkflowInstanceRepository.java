package com.manageedocs.workflows.repository;

import com.manageedocs.workflows.model.WorkflowInstance;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkflowInstanceRepository extends JpaRepository<WorkflowInstance, UUID> {

    /** Serialises decisions on one instance (two approvers clicking at once). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from WorkflowInstance i where i.id = :id")
    Optional<WorkflowInstance> findForUpdate(@Param("id") UUID id);

    List<WorkflowInstance> findByDocumentIdOrderByStartedAtDesc(UUID documentId);

    boolean existsByDocumentIdAndStatusIn(UUID documentId, Collection<WorkflowInstance.Status> statuses);
}
