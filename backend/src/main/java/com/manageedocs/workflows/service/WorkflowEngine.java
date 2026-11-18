package com.manageedocs.workflows.service;

import com.manageedocs.audit.model.AuditOutcome;
import com.manageedocs.audit.service.AuditService;
import com.manageedocs.documents.model.Document;
import com.manageedocs.documents.repository.DocumentRepository;
import com.manageedocs.exception.ApiException;
import com.manageedocs.identity.model.Role;
import com.manageedocs.identity.repository.UserRepository;
import com.manageedocs.notifications.service.NotificationService;
import com.manageedocs.permissions.model.ResourceRight;
import com.manageedocs.security.AppUserDetails;
import com.manageedocs.security.Permission;
import com.manageedocs.taxonomy.service.TaxonomyAccess;
import com.manageedocs.workflows.dto.WorkflowDtos.Decision;
import com.manageedocs.workflows.dto.WorkflowDtos.EventView;
import com.manageedocs.workflows.dto.WorkflowDtos.InstanceView;
import com.manageedocs.workflows.dto.WorkflowDtos.TaskView;
import com.manageedocs.workflows.model.WorkflowDefinition;
import com.manageedocs.workflows.model.WorkflowDefinitionVersion;
import com.manageedocs.workflows.model.WorkflowEvent;
import com.manageedocs.workflows.model.WorkflowInstance;
import com.manageedocs.workflows.model.WorkflowStep;
import com.manageedocs.workflows.model.WorkflowStepUser;
import com.manageedocs.workflows.model.WorkflowTask;
import com.manageedocs.workflows.repository.WorkflowDefinitionVersionRepository;
import com.manageedocs.workflows.repository.WorkflowEventRepository;
import com.manageedocs.workflows.repository.WorkflowInstanceRepository;
import com.manageedocs.workflows.repository.WorkflowStepRepository;
import com.manageedocs.workflows.repository.WorkflowStepUserRepository;
import com.manageedocs.workflows.repository.WorkflowTaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Runs reviews. Every transition is validated here (never trusted from the client), recorded in the
 * instance history and the audit trail, and announced through notifications.
 *
 * <p>Rules: the submitter cannot decide their own review (segregation of duties); a decider must be
 * assigned (directly or via role) and able to view the document; while under review the document
 * is frozen; requesting changes returns it to the author, who must upload a new version before
 * resubmitting.
 */
@Service
public class WorkflowEngine {

    private static final EnumSet<WorkflowInstance.Status> OPEN =
            EnumSet.of(WorkflowInstance.Status.IN_PROGRESS, WorkflowInstance.Status.CHANGES_REQUESTED);

    private final WorkflowDefinitionService definitions;
    private final WorkflowDefinitionVersionRepository versions;
    private final WorkflowStepRepository steps;
    private final WorkflowStepUserRepository stepUsers;
    private final WorkflowInstanceRepository instances;
    private final WorkflowTaskRepository tasks;
    private final WorkflowEventRepository events;
    private final DocumentRepository documents;
    private final UserRepository users;
    private final TaxonomyAccess access;
    private final NotificationService notifications;
    private final AuditService audit;
    private final Clock clock;

    public WorkflowEngine(WorkflowDefinitionService definitions, WorkflowDefinitionVersionRepository versions,
                          WorkflowStepRepository steps, WorkflowStepUserRepository stepUsers,
                          WorkflowInstanceRepository instances, WorkflowTaskRepository tasks,
                          WorkflowEventRepository events, DocumentRepository documents, UserRepository users,
                          TaxonomyAccess access, NotificationService notifications, AuditService audit, Clock clock) {
        this.definitions = definitions;
        this.versions = versions;
        this.steps = steps;
        this.stepUsers = stepUsers;
        this.instances = instances;
        this.tasks = tasks;
        this.events = events;
        this.documents = documents;
        this.users = users;
        this.access = access;
        this.notifications = notifications;
        this.audit = audit;
        this.clock = clock;
    }

    // ── Submit / resubmit / cancel ────────────────────────────────────────

    @Transactional
    public InstanceView submit(AppUserDetails caller, UUID documentId, UUID definitionId, String comment) {
        Document doc = lockVisibleDocument(caller, documentId, ResourceRight.EDIT);
        if (instances.existsByDocumentIdAndStatusIn(documentId, OPEN)) {
            throw ApiException.conflict("WORKFLOW_ACTIVE", "This document already has a review in progress");
        }
        WorkflowDefinition def = definitions.definition(definitionId);
        if (!def.isActive()) throw ApiException.conflict("WORKFLOW_INACTIVE", "This workflow is no longer active");
        WorkflowDefinitionVersion version = versions.findByDefinitionIdAndVersionNo(def.getId(), def.getCurrentVersionNo()).orElseThrow();
        Plan plan = plan(version.getId(), caller.userId());

        Instant now = clock.instant();
        doc.submitForReview();
        WorkflowInstance inst = instances.save(new WorkflowInstance(version.getId(), documentId, doc.getCurrentVersionNo(),
                plan.first().getStepOrder(), caller.userId(), now));
        event(inst, null, "SUBMITTED", caller.userId(), null, WorkflowInstance.Status.IN_PROGRESS, comment);
        openStep(inst, plan.first(), plan, doc, caller.userId());
        audit.success(caller, "WORKFLOW_SUBMITTED", "DOCUMENT", documentId, Map.of(
                "instanceId", inst.getId().toString(), "workflow", def.getName(),
                "definitionVersion", Integer.toString(version.getVersionNo()),
                "documentVersion", Integer.toString(doc.getCurrentVersionNo())));
        return view(inst);
    }

    /** After changes were requested and a new document version uploaded. Restarts from the first step. */
    @Transactional
    public InstanceView resubmit(AppUserDetails caller, UUID instanceId, String comment) {
        WorkflowInstance inst = lockInstance(instanceId);
        Document doc = lockVisibleDocument(caller, inst.getDocumentId(), ResourceRight.EDIT);
        if (inst.getStatus() != WorkflowInstance.Status.CHANGES_REQUESTED) {
            throw ApiException.conflict("INVALID_TRANSITION", "Only reviews returned for changes can be resubmitted");
        }
        if (doc.getCurrentVersionNo() <= inst.getDocumentVersionNo()) {
            throw ApiException.conflict("NO_NEW_VERSION", "Upload a revised version before resubmitting");
        }
        Plan plan = plan(inst.getDefinitionVersionId(), inst.getInitiatedBy());
        doc.submitForReview();
        inst.resubmit(doc.getCurrentVersionNo(), plan.first().getStepOrder());
        event(inst, null, "RESUBMITTED", caller.userId(), WorkflowInstance.Status.CHANGES_REQUESTED,
                WorkflowInstance.Status.IN_PROGRESS, comment);
        openStep(inst, plan.first(), plan, doc, inst.getInitiatedBy());
        audit.success(caller, "WORKFLOW_RESUBMITTED", "DOCUMENT", doc.getId(), Map.of(
                "instanceId", instanceId.toString(), "documentVersion", Integer.toString(doc.getCurrentVersionNo())));
        return view(inst);
    }

    @Transactional
    public InstanceView cancel(AppUserDetails caller, UUID instanceId, String comment) {
        WorkflowInstance inst = lockInstance(instanceId);
        Document doc = lockVisibleDocument(caller, inst.getDocumentId(), ResourceRight.VIEW);
        if (!caller.userId().equals(inst.getInitiatedBy()) && !caller.has(Permission.WORKFLOWS_MANAGE)) {
            throw ApiException.forbidden("Only the submitter or a workflow administrator can cancel this review");
        }
        WorkflowInstance.Status from = inst.getStatus();
        Instant now = clock.instant();
        inst.cancel(now);
        tasks.findByInstanceIdOrderByStepOrderAscCreatedAtAsc(instanceId)
                .forEach(t -> t.close(WorkflowTask.Status.CANCELLED, now));
        doc.returnToDraft();
        event(inst, null, "CANCELLED", caller.userId(), from, WorkflowInstance.Status.CANCELLED, comment);
        audit.success(caller, "WORKFLOW_CANCELLED", "DOCUMENT", doc.getId(), Map.of("instanceId", instanceId.toString()));
        return view(inst);
    }

    // ── Decisions ─────────────────────────────────────────────────────────

    @Transactional
    public InstanceView decide(AppUserDetails caller, UUID taskId, Decision decision, String comment) {
        WorkflowTask task = tasks.findById(taskId).orElseThrow(() -> ApiException.notFound("Task"));
        WorkflowInstance inst = lockInstance(task.getInstanceId());
        Document doc = lockVisibleDocument(caller, inst.getDocumentId(), ResourceRight.VIEW);
        if (!task.isAssignedTo(caller.userId(), caller.role())) {
            throw ApiException.forbidden("This task is not assigned to you");
        }
        if (caller.userId().equals(inst.getInitiatedBy())) {
            throw ApiException.forbidden("You cannot decide on a review you submitted");
        }
        if (task.getStatus() != WorkflowTask.Status.OPEN || inst.getStatus() != WorkflowInstance.Status.IN_PROGRESS) {
            throw ApiException.conflict("TASK_CLOSED", "This task has already been decided");
        }
        if (decision != Decision.APPROVE && (comment == null || comment.isBlank())) {
            throw new IllegalArgumentException("Explain why when rejecting or requesting changes");
        }
        Instant now = clock.instant();
        List<WorkflowTask> stepTasks = tasks.findByInstanceIdAndStepOrder(inst.getId(), task.getStepOrder());
        switch (decision) {
            case APPROVE -> {
                task.decide(WorkflowTask.Status.APPROVED, caller.userId(), comment, now);
                event(inst, task, "APPROVED", caller.userId(), null, null, comment);
                WorkflowStep step = stepAt(inst.getDefinitionVersionId(), task.getStepOrder());
                boolean complete = step.getMode() == WorkflowStep.Mode.ANY
                        || stepTasks.stream().allMatch(t -> t.getStatus() == WorkflowTask.Status.APPROVED);
                if (complete) {
                    stepTasks.forEach(t -> t.close(WorkflowTask.Status.SUPERSEDED, now));
                    Plan plan = plan(inst.getDefinitionVersionId(), inst.getInitiatedBy());
                    WorkflowStep next = plan.after(step.getStepOrder());
                    if (next != null) {
                        inst.advanceTo(next.getStepOrder());
                        event(inst, null, "STEP_COMPLETED", caller.userId(), null, null, step.getName());
                        openStep(inst, next, plan, doc, inst.getInitiatedBy());
                    } else {
                        inst.approve(now);
                        doc.markApproved();
                        event(inst, null, "COMPLETED", caller.userId(), WorkflowInstance.Status.IN_PROGRESS,
                                WorkflowInstance.Status.APPROVED, null);
                        notifyInitiator(inst, doc, "WORKFLOW_APPROVED", "Approved: " + doc.getTitle(), null);
                        audit.success(caller, "WORKFLOW_APPROVED", "DOCUMENT", doc.getId(), Map.of("instanceId", inst.getId().toString()));
                    }
                }
            }
            case REJECT -> {
                task.decide(WorkflowTask.Status.REJECTED, caller.userId(), comment, now);
                stepTasks.forEach(t -> t.close(WorkflowTask.Status.SUPERSEDED, now));
                inst.reject(now);
                doc.returnToDraft();
                event(inst, task, "REJECTED", caller.userId(), WorkflowInstance.Status.IN_PROGRESS,
                        WorkflowInstance.Status.REJECTED, comment);
                notifyInitiator(inst, doc, "WORKFLOW_REJECTED", "Rejected: " + doc.getTitle(), comment);
                audit.success(caller, "WORKFLOW_REJECTED", "DOCUMENT", doc.getId(), Map.of("instanceId", inst.getId().toString()));
            }
            case REQUEST_CHANGES -> {
                task.decide(WorkflowTask.Status.CHANGES_REQUESTED, caller.userId(), comment, now);
                stepTasks.forEach(t -> t.close(WorkflowTask.Status.SUPERSEDED, now));
                inst.requestChanges();
                doc.returnToDraft();
                event(inst, task, "CHANGES_REQUESTED", caller.userId(), WorkflowInstance.Status.IN_PROGRESS,
                        WorkflowInstance.Status.CHANGES_REQUESTED, comment);
                notifyInitiator(inst, doc, "WORKFLOW_CHANGES_REQUESTED", "Changes requested: " + doc.getTitle(), comment);
                audit.success(caller, "WORKFLOW_CHANGES_REQUESTED", "DOCUMENT", doc.getId(), Map.of("instanceId", inst.getId().toString()));
            }
        }
        return view(inst);
    }

    /** Hands an open task to a colleague (who must be able to view the document). */
    @Transactional
    public InstanceView delegate(AppUserDetails caller, UUID taskId, UUID toUserId, String comment) {
        WorkflowTask task = tasks.findById(taskId).orElseThrow(() -> ApiException.notFound("Task"));
        WorkflowInstance inst = lockInstance(task.getInstanceId());
        Document doc = lockVisibleDocument(caller, inst.getDocumentId(), ResourceRight.VIEW);
        if (!task.isAssignedTo(caller.userId(), caller.role())) throw ApiException.forbidden("This task is not assigned to you");
        if (toUserId.equals(inst.getInitiatedBy())) throw new IllegalArgumentException("A review cannot be delegated to its submitter");
        if (users.findById(toUserId).filter(u -> u.isActive()).isEmpty()) throw ApiException.notFound("User");
        task.delegateTo(toUserId, caller.userId());
        event(inst, task, "DELEGATED", caller.userId(), null, null, comment);
        notifications.notifyUsers(List.of(toUserId), "WORKFLOW_TASK_DELEGATED", "Review delegated to you: " + doc.getTitle(),
                comment, "DOCUMENT", doc.getId());
        audit.success(caller, "WORKFLOW_TASK_DELEGATED", "DOCUMENT", doc.getId(), Map.of(
                "taskId", taskId.toString(), "to", toUserId.toString()));
        return view(inst);
    }

    /** Approved → Published. */
    @Transactional
    public void publish(AppUserDetails caller, UUID documentId) {
        Document doc = lockVisibleDocument(caller, documentId, ResourceRight.EDIT);
        if (doc.getStatus() != Document.Status.APPROVED) {
            throw ApiException.conflict("NOT_APPROVED", "Only approved documents can be published");
        }
        doc.publish();
        audit.success(caller, "DOCUMENT_PUBLISHED", "DOCUMENT", documentId, null);
    }

    /** Overdue open tasks: flag once, notify the assignees and the organisation's administrators. */
    @Transactional
    public int escalateOverdue() {
        Instant now = clock.instant();
        int n = 0;
        for (WorkflowTask t : tasks.findOverdue(now)) {
            WorkflowInstance inst = instances.findById(t.getInstanceId()).orElseThrow();
            Document doc = documents.findById(inst.getDocumentId()).orElse(null);
            t.markEscalated(now);
            event(inst, t, "ESCALATED", null, null, null, "Due " + t.getDueAt());
            Set<UUID> recipients = new LinkedHashSet<>(assignees(t, inst.getInitiatedBy()));
            recipients.addAll(notifications.membersOf(Role.ADMIN, null));
            String title = "Overdue review: " + (doc == null ? "document" : doc.getTitle()) + " (" + t.getStepName() + ")";
            notifications.notifyUsers(recipients, "WORKFLOW_TASK_ESCALATED", title, null, "DOCUMENT", inst.getDocumentId());
            audit.record(AuditService.Actor.anonymous("system:workflows", null), "WORKFLOW_TASK_ESCALATED",
                    AuditOutcome.SUCCESS, "DOCUMENT", inst.getDocumentId().toString(),
                    Map.of("taskId", t.getId().toString(), "dueAt", String.valueOf(t.getDueAt())));
            n++;
        }
        return n;
    }

    // ── Queries ───────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<TaskView> myTasks(AppUserDetails caller) {
        List<WorkflowTask> open = tasks.findOpenFor(caller.userId(), caller.role());
        Map<UUID, WorkflowInstance> byId = instances.findAllById(open.stream().map(WorkflowTask::getInstanceId).toList())
                .stream().collect(Collectors.toMap(WorkflowInstance::getId, i -> i));
        Map<UUID, String> titles = documents.findAllById(byId.values().stream().map(WorkflowInstance::getDocumentId).toList())
                .stream().collect(Collectors.toMap(Document::getId, Document::getTitle));
        // Reviews the caller submitted are not theirs to decide; documents they cannot see are not listed.
        return open.stream()
                .filter(t -> !caller.userId().equals(byId.get(t.getInstanceId()).getInitiatedBy()))
                .filter(t -> titles.containsKey(byId.get(t.getInstanceId()).getDocumentId()))
                .filter(t -> canView(caller, byId.get(t.getInstanceId()).getDocumentId()))
                .map(t -> taskView(t, byId.get(t.getInstanceId()).getDocumentId(), titles.get(byId.get(t.getInstanceId()).getDocumentId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<InstanceView> forDocument(AppUserDetails caller, UUID documentId) {
        Document d = documents.findById(documentId).orElseThrow(() -> ApiException.notFound("Document"));
        access.policy().require(rights(caller, d), ResourceRight.VIEW, "Document", documentId);
        return instances.findByDocumentIdOrderByStartedAtDesc(documentId).stream().map(this::view).toList();
    }

    @Transactional(readOnly = true)
    public InstanceView get(AppUserDetails caller, UUID instanceId) {
        WorkflowInstance inst = instances.findById(instanceId).orElseThrow(() -> ApiException.notFound("Workflow"));
        Document d = documents.findById(inst.getDocumentId()).orElseThrow(() -> ApiException.notFound("Workflow"));
        access.policy().require(rights(caller, d), ResourceRight.VIEW, "Document", d.getId());
        return view(inst);
    }

    // ── Internals ─────────────────────────────────────────────────────────

    /** Steps of a definition version with who can decide each, minus the submitter (segregation of duties). */
    private record Plan(List<WorkflowStep> steps, Map<UUID, List<UUID>> namedUsers, Map<Role, Set<UUID>> roleMembers) {
        WorkflowStep first() {
            return steps.get(0);
        }

        WorkflowStep after(int order) {
            return steps.stream().filter(s -> s.getStepOrder() > order).findFirst().orElse(null);
        }
    }

    /** Validates up front that every step has someone other than the submitter who can decide it. */
    private Plan plan(UUID versionId, UUID submitter) {
        List<WorkflowStep> list = steps.findByDefinitionVersionIdOrderByStepOrderAsc(versionId);
        Map<UUID, List<UUID>> named = list.isEmpty() ? Map.of() : stepUsers
                .findForSteps(list.stream().map(WorkflowStep::getId).toList()).stream()
                .collect(Collectors.groupingBy(WorkflowStepUser::stepId, Collectors.mapping(WorkflowStepUser::userId, Collectors.toList())));
        Map<Role, Set<UUID>> members = new HashMap<>();
        for (WorkflowStep s : list) {
            if (s.getAssigneeRole() != null) {
                Set<UUID> m = members.computeIfAbsent(s.getAssigneeRole(), r -> notifications.membersOf(r, submitter));
                if (m.isEmpty()) {
                    throw ApiException.conflict("NO_ELIGIBLE_REVIEWER", "Step '" + s.getName()
                            + "' has no eligible reviewer (nobody with role " + s.getAssigneeRole() + " other than you)");
                }
            } else {
                List<UUID> users = named.getOrDefault(s.getId(), List.of());
                if (s.getMode() == WorkflowStep.Mode.ALL && users.contains(submitter)) {
                    throw ApiException.conflict("SELF_APPROVAL", "Step '" + s.getName()
                            + "' requires your own approval; you cannot approve your own submission");
                }
                if (users.stream().noneMatch(u -> !u.equals(submitter))) {
                    throw ApiException.conflict("NO_ELIGIBLE_REVIEWER", "Step '" + s.getName() + "' has no eligible reviewer");
                }
            }
        }
        return new Plan(list, named, members);
    }

    private void openStep(WorkflowInstance inst, WorkflowStep step, Plan plan, Document doc, UUID submitter) {
        Instant due = step.getDueDays() == null ? null : clock.instant().plus(Duration.ofDays(step.getDueDays()));
        List<UUID> notify = new ArrayList<>();
        if (step.getAssigneeRole() != null) {
            tasks.save(WorkflowTask.forRole(inst.getId(), step, step.getAssigneeRole(), due));
            notify.addAll(plan.roleMembers().get(step.getAssigneeRole()));
        } else {
            for (UUID u : plan.namedUsers().getOrDefault(step.getId(), List.of())) {
                if (u.equals(submitter)) continue;
                tasks.save(WorkflowTask.forUser(inst.getId(), step, u, due));
                notify.add(u);
            }
        }
        event(inst, null, "STEP_OPENED", null, null, null, step.getName());
        notifications.notifyUsers(notify, "WORKFLOW_TASK_ASSIGNED", "Review requested: " + doc.getTitle(),
                step.getName() + (due == null ? "" : " — due " + due), "DOCUMENT", doc.getId());
    }

    private Set<UUID> assignees(WorkflowTask t, UUID submitter) {
        if (t.getAssigneeUserId() != null) return Set.of(t.getAssigneeUserId());
        return notifications.membersOf(t.getAssigneeRole(), submitter);
    }

    private void notifyInitiator(WorkflowInstance inst, Document doc, String type, String title, String body) {
        notifications.notifyUsers(List.of(inst.getInitiatedBy()), type, title, body, "DOCUMENT", doc.getId());
    }

    private WorkflowStep stepAt(UUID versionId, int order) {
        return steps.findByDefinitionVersionIdOrderByStepOrderAsc(versionId).stream()
                .filter(s -> s.getStepOrder() == order).findFirst().orElseThrow();
    }

    private WorkflowInstance lockInstance(UUID id) {
        return instances.findForUpdate(id).orElseThrow(() -> ApiException.notFound("Workflow"));
    }

    private Document lockVisibleDocument(AppUserDetails caller, UUID documentId, ResourceRight right) {
        Document d = documents.findForUpdate(documentId).orElseThrow(() -> ApiException.notFound("Document"));
        access.policy().require(rights(caller, d), right, "Document", documentId);
        return d;
    }

    private int rights(AppUserDetails caller, Document d) {
        return access.onDocument(caller, d.getCabinetId(), access.folder(d.getFolderId()), d.getId());
    }

    private boolean canView(AppUserDetails caller, UUID documentId) {
        return documents.findById(documentId).map(d -> ResourceRight.VIEW.in(rights(caller, d))).orElse(false);
    }

    private void event(WorkflowInstance inst, WorkflowTask task, String action, UUID actor,
                       WorkflowInstance.Status from, WorkflowInstance.Status to, String comment) {
        events.save(new WorkflowEvent(inst.getId(), task == null ? null : task.getId(), action, actor,
                from == null ? null : from.name(), to == null ? null : to.name(), comment, clock.instant()));
    }

    private TaskView taskView(WorkflowTask t, UUID documentId, String title) {
        boolean overdue = t.getStatus() == WorkflowTask.Status.OPEN && t.getDueAt() != null && t.getDueAt().isBefore(clock.instant());
        return new TaskView(t.getId(), t.getInstanceId(), documentId, title, t.getStepOrder(), t.getStepName(),
                t.getAssigneeUserId(), t.getAssigneeRole(), t.getStatus(), t.getDecidedBy(), t.getDecidedAt(),
                t.getComment(), t.getDueAt(), overdue, t.getEscalatedAt(), t.getDelegatedFrom(), t.getCreatedAt());
    }

    private InstanceView view(WorkflowInstance inst) {
        WorkflowDefinitionVersion v = versions.findById(inst.getDefinitionVersionId()).orElseThrow();
        String name = definitions.definition(v.getDefinitionId()).getName();
        String title = documents.findById(inst.getDocumentId()).map(Document::getTitle).orElse(null);
        List<TaskView> taskViews = tasks.findByInstanceIdOrderByStepOrderAscCreatedAtAsc(inst.getId()).stream()
                .map(t -> taskView(t, inst.getDocumentId(), title)).toList();
        List<EventView> history = events.findByInstanceIdInOrderByOccurredAtAsc(List.of(inst.getId())).stream()
                .map(e -> new EventView(e.getAction(), e.getActorId(), e.getFromStatus(), e.getToStatus(), e.getComment(),
                        e.getOccurredAt())).toList();
        return new InstanceView(inst.getId(), inst.getDocumentId(), name, v.getVersionNo(), inst.getDocumentVersionNo(),
                inst.getStatus(), inst.getCurrentStepOrder(), inst.getInitiatedBy(), inst.getStartedAt(),
                inst.getCompletedAt(), taskViews, history);
    }
}
