package com.manageedocs.workflows.service;

import com.manageedocs.audit.service.AuditService;
import com.manageedocs.exception.ApiException;
import com.manageedocs.identity.model.Role;
import com.manageedocs.identity.repository.UserRepository;
import com.manageedocs.security.AppUserDetails;
import com.manageedocs.workflows.dto.WorkflowDtos.DefinitionRequest;
import com.manageedocs.workflows.dto.WorkflowDtos.DefinitionView;
import com.manageedocs.workflows.dto.WorkflowDtos.StepSpec;
import com.manageedocs.workflows.dto.WorkflowDtos.StepView;
import com.manageedocs.workflows.model.WorkflowDefinition;
import com.manageedocs.workflows.model.WorkflowDefinitionVersion;
import com.manageedocs.workflows.model.WorkflowStep;
import com.manageedocs.workflows.model.WorkflowStepUser;
import com.manageedocs.workflows.repository.WorkflowDefinitionRepository;
import com.manageedocs.workflows.repository.WorkflowDefinitionVersionRepository;
import com.manageedocs.workflows.repository.WorkflowStepRepository;
import com.manageedocs.workflows.repository.WorkflowStepUserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Workflow definitions. Editing never mutates a version that instances may be running on: it
 * creates the next version, and new submissions use it (ADR-009).
 */
@Service
public class WorkflowDefinitionService {

    private final WorkflowDefinitionRepository definitions;
    private final WorkflowDefinitionVersionRepository versions;
    private final WorkflowStepRepository steps;
    private final WorkflowStepUserRepository stepUsers;
    private final UserRepository users;
    private final AuditService audit;
    private final Clock clock;

    public WorkflowDefinitionService(WorkflowDefinitionRepository definitions, WorkflowDefinitionVersionRepository versions,
                                     WorkflowStepRepository steps, WorkflowStepUserRepository stepUsers,
                                     UserRepository users, AuditService audit, Clock clock) {
        this.definitions = definitions;
        this.versions = versions;
        this.steps = steps;
        this.stepUsers = stepUsers;
        this.users = users;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<DefinitionView> list() {
        return definitions.findAllByOrderByNameAsc().stream().map(this::view).toList();
    }

    @Transactional(readOnly = true)
    public DefinitionView get(UUID id) {
        return view(definition(id));
    }

    @Transactional
    public DefinitionView create(AppUserDetails caller, DefinitionRequest req) {
        if (definitions.existsByNameIgnoreCase(req.name().trim())) {
            throw ApiException.conflict("WORKFLOW_EXISTS", "A workflow with this name already exists");
        }
        validate(req.steps());
        WorkflowDefinition d = definitions.save(new WorkflowDefinition(req.name(), req.description()));
        writeVersion(caller, d.getId(), 1, req.steps());
        audit.success(caller, "WORKFLOW_DEFINITION_CREATED", "WORKFLOW_DEFINITION", d.getId(),
                Map.of("name", d.getName(), "steps", Integer.toString(req.steps().size())));
        return view(d);
    }

    /** New version of the steps; instances already running keep their pinned version. */
    @Transactional
    public DefinitionView revise(AppUserDetails caller, UUID id, DefinitionRequest req) {
        WorkflowDefinition d = definition(id);
        if (!d.isActive()) throw ApiException.conflict("WORKFLOW_INACTIVE", "Inactive workflows cannot be revised");
        validate(req.steps());
        int no = d.revise();
        writeVersion(caller, d.getId(), no, req.steps());
        audit.success(caller, "WORKFLOW_DEFINITION_REVISED", "WORKFLOW_DEFINITION", id,
                Map.of("versionNo", Integer.toString(no), "steps", Integer.toString(req.steps().size())));
        return view(d);
    }

    @Transactional
    public void deactivate(AppUserDetails caller, UUID id) {
        WorkflowDefinition d = definition(id);
        d.deactivate();
        audit.success(caller, "WORKFLOW_DEFINITION_DEACTIVATED", "WORKFLOW_DEFINITION", id, Map.of("name", d.getName()));
    }

    WorkflowDefinition definition(UUID id) {
        return definitions.findById(id).orElseThrow(() -> ApiException.notFound("Workflow"));
    }

    private void writeVersion(AppUserDetails caller, UUID definitionId, int no, List<StepSpec> specs) {
        WorkflowDefinitionVersion v = versions.save(new WorkflowDefinitionVersion(definitionId, no, caller.userId(), clock.instant()));
        int order = 1;
        for (StepSpec s : specs) {
            WorkflowStep step = steps.save(new WorkflowStep(v.getId(), order++, s.name(), s.approvalMode(),
                    s.assigneeRole(), s.dueDays()));
            if (s.assigneeUserIds() != null) {
                for (UUID u : new HashSet<>(s.assigneeUserIds())) stepUsers.save(new WorkflowStepUser(step.getId(), u));
            }
        }
    }

    private void validate(List<StepSpec> specs) {
        if (specs.size() > 20) throw new IllegalArgumentException("A workflow can have at most 20 steps");
        for (StepSpec s : specs) {
            boolean hasRole = s.assigneeRole() != null;
            boolean hasUsers = s.assigneeUserIds() != null && !s.assigneeUserIds().isEmpty();
            if (hasRole == hasUsers) {
                throw new IllegalArgumentException("Step '" + s.name() + "' needs either an assignee role or assignee users, not both");
            }
            if (s.assigneeRole() == Role.SUPER_ADMIN) throw new IllegalArgumentException("Platform roles cannot be assigned");
            if (hasRole && s.approvalMode() == WorkflowStep.Mode.ALL) {
                throw new IllegalArgumentException("Step '" + s.name() + "': ALL approval needs named users");
            }
            if (hasUsers) {
                Set<UUID> ids = new HashSet<>(s.assigneeUserIds());
                // Tenant-scoped lookup: users from another organisation simply are not found.
                if (users.findAllById(ids).stream().filter(u -> u.isActive()).count() != ids.size()) {
                    throw ApiException.notFound("Assignee user");
                }
            }
        }
    }

    private DefinitionView view(WorkflowDefinition d) {
        WorkflowDefinitionVersion v = versions.findByDefinitionIdAndVersionNo(d.getId(), d.getCurrentVersionNo()).orElseThrow();
        return new DefinitionView(d.getId(), d.getName(), d.getDescription(), d.isActive(), d.getCurrentVersionNo(),
                stepViews(v.getId()));
    }

    List<StepView> stepViews(UUID versionId) {
        List<WorkflowStep> list = steps.findByDefinitionVersionIdOrderByStepOrderAsc(versionId);
        Map<UUID, List<UUID>> usersByStep = list.isEmpty() ? Map.of() : stepUsers
                .findForSteps(list.stream().map(WorkflowStep::getId).toList()).stream()
                .collect(Collectors.groupingBy(WorkflowStepUser::stepId, Collectors.mapping(WorkflowStepUser::userId, Collectors.toList())));
        return list.stream().map(s -> new StepView(s.getStepOrder(), s.getName(), s.getMode(), s.getAssigneeRole(),
                usersByStep.getOrDefault(s.getId(), List.of()), s.getDueDays())).toList();
    }
}
