package com.manageedocs.workflows.repository;

import com.manageedocs.workflows.model.WorkflowStepUser;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface WorkflowStepUserRepository extends JpaRepository<WorkflowStepUser, WorkflowStepUser.Key> {

    @Query("select u from WorkflowStepUser u where u.id.stepId in :stepIds")
    List<WorkflowStepUser> findForSteps(@Param("stepIds") Collection<UUID> stepIds);
}
