package com.manageedocs.workflows.repository;

import com.manageedocs.identity.model.Role;
import com.manageedocs.workflows.model.WorkflowTask;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface WorkflowTaskRepository extends JpaRepository<WorkflowTask, UUID> {

    List<WorkflowTask> findByInstanceIdOrderByStepOrderAscCreatedAtAsc(UUID instanceId);

    List<WorkflowTask> findByInstanceIdInOrderByStepOrderAscCreatedAtAsc(Collection<UUID> instanceIds);

    List<WorkflowTask> findByInstanceIdAndStepOrder(UUID instanceId, int stepOrder);

    /** Open tasks this user can act on: assigned directly, or to their role. */
    @Query("""
            select t from WorkflowTask t
            where t.status = com.manageedocs.workflows.model.WorkflowTask.Status.OPEN
              and (t.assigneeUserId = :userId or t.assigneeRole = :role)
            order by t.dueAt asc, t.createdAt asc
            """)
    List<WorkflowTask> findOpenFor(@Param("userId") UUID userId, @Param("role") Role role);

    @Query("""
            select t from WorkflowTask t
            where t.status = com.manageedocs.workflows.model.WorkflowTask.Status.OPEN
              and t.dueAt is not null and t.dueAt < :now and t.escalatedAt is null
            """)
    List<WorkflowTask> findOverdue(@Param("now") Instant now);
}
