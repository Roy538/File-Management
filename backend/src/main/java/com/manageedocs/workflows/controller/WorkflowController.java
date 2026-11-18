package com.manageedocs.workflows.controller;

import com.manageedocs.common.dto.StandardAPIResponse;
import com.manageedocs.security.CurrentUser;
import com.manageedocs.workflows.dto.WorkflowDtos.CommentRequest;
import com.manageedocs.workflows.dto.WorkflowDtos.DecisionRequest;
import com.manageedocs.workflows.dto.WorkflowDtos.DefinitionRequest;
import com.manageedocs.workflows.dto.WorkflowDtos.DefinitionView;
import com.manageedocs.workflows.dto.WorkflowDtos.DelegateRequest;
import com.manageedocs.workflows.dto.WorkflowDtos.InstanceView;
import com.manageedocs.workflows.dto.WorkflowDtos.SubmitRequest;
import com.manageedocs.workflows.dto.WorkflowDtos.TaskView;
import com.manageedocs.workflows.service.WorkflowDefinitionService;
import com.manageedocs.workflows.service.WorkflowEngine;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@Tag(name = "Workflows")
@RestController
@RequestMapping("/api/v1")
public class WorkflowController {

    private final WorkflowDefinitionService definitions;
    private final WorkflowEngine engine;

    public WorkflowController(WorkflowDefinitionService definitions, WorkflowEngine engine) {
        this.definitions = definitions;
        this.engine = engine;
    }

    // ── Definitions ───────────────────────────────────────────────────────

    @GetMapping("/workflows")
    @PreAuthorize("hasAuthority('WORKFLOWS_PARTICIPATE') or hasAuthority('WORKFLOWS_MANAGE')")
    public StandardAPIResponse<List<DefinitionView>> list() {
        return StandardAPIResponse.success(definitions.list(), "Workflows retrieved");
    }

    @GetMapping("/workflows/{id}")
    @PreAuthorize("hasAuthority('WORKFLOWS_PARTICIPATE') or hasAuthority('WORKFLOWS_MANAGE')")
    public StandardAPIResponse<DefinitionView> get(@PathVariable UUID id) {
        return StandardAPIResponse.success(definitions.get(id), "Workflow retrieved");
    }

    @PostMapping("/workflows")
    @PreAuthorize("hasAuthority('WORKFLOWS_MANAGE')")
    public ResponseEntity<StandardAPIResponse<DefinitionView>> create(@Valid @RequestBody DefinitionRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(StandardAPIResponse.success(definitions.create(CurrentUser.get(), req), "Workflow created"));
    }

    @Operation(summary = "Revise steps (creates a new version; running reviews keep theirs)")
    @PutMapping("/workflows/{id}")
    @PreAuthorize("hasAuthority('WORKFLOWS_MANAGE')")
    public StandardAPIResponse<DefinitionView> revise(@PathVariable UUID id, @Valid @RequestBody DefinitionRequest req) {
        return StandardAPIResponse.success(definitions.revise(CurrentUser.get(), id, req), "Workflow revised");
    }

    @DeleteMapping("/workflows/{id}")
    @PreAuthorize("hasAuthority('WORKFLOWS_MANAGE')")
    public StandardAPIResponse<Void> deactivate(@PathVariable UUID id) {
        definitions.deactivate(CurrentUser.get(), id);
        return StandardAPIResponse.success("Workflow deactivated");
    }

    // ── Reviews ───────────────────────────────────────────────────────────

    @Operation(summary = "Submit a document for review")
    @PostMapping("/documents/{documentId}/reviews")
    @PreAuthorize("hasAuthority('WORKFLOWS_PARTICIPATE')")
    public ResponseEntity<StandardAPIResponse<InstanceView>> submit(@PathVariable UUID documentId,
                                                                    @Valid @RequestBody SubmitRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(StandardAPIResponse.success(
                engine.submit(CurrentUser.get(), documentId, req.definitionId(), req.comment()), "Submitted for review"));
    }

    @Operation(summary = "Review history of a document (instances, tasks, transitions)")
    @GetMapping("/documents/{documentId}/reviews")
    @PreAuthorize("hasAuthority('DOCUMENTS_VIEW')")
    public StandardAPIResponse<List<InstanceView>> forDocument(@PathVariable UUID documentId) {
        return StandardAPIResponse.success(engine.forDocument(CurrentUser.get(), documentId), "Reviews retrieved");
    }

    @GetMapping("/reviews/{instanceId}")
    @PreAuthorize("hasAuthority('DOCUMENTS_VIEW')")
    public StandardAPIResponse<InstanceView> review(@PathVariable UUID instanceId) {
        return StandardAPIResponse.success(engine.get(CurrentUser.get(), instanceId), "Review retrieved");
    }

    @PostMapping("/reviews/{instanceId}/resubmit")
    @PreAuthorize("hasAuthority('WORKFLOWS_PARTICIPATE')")
    public StandardAPIResponse<InstanceView> resubmit(@PathVariable UUID instanceId,
                                                     @Valid @RequestBody(required = false) CommentRequest req) {
        return StandardAPIResponse.success(engine.resubmit(CurrentUser.get(), instanceId, req == null ? null : req.comment()),
                "Resubmitted for review");
    }

    @PostMapping("/reviews/{instanceId}/cancel")
    @PreAuthorize("hasAuthority('WORKFLOWS_PARTICIPATE') or hasAuthority('WORKFLOWS_MANAGE')")
    public StandardAPIResponse<InstanceView> cancel(@PathVariable UUID instanceId,
                                                   @Valid @RequestBody(required = false) CommentRequest req) {
        return StandardAPIResponse.success(engine.cancel(CurrentUser.get(), instanceId, req == null ? null : req.comment()),
                "Review cancelled");
    }

    @Operation(summary = "Open review tasks assigned to me (directly or via my role)")
    @GetMapping("/tasks")
    @PreAuthorize("hasAuthority('WORKFLOWS_PARTICIPATE')")
    public StandardAPIResponse<List<TaskView>> myTasks() {
        return StandardAPIResponse.success(engine.myTasks(CurrentUser.get()), "Tasks retrieved");
    }

    @PostMapping("/tasks/{taskId}/decision")
    @PreAuthorize("hasAuthority('WORKFLOWS_PARTICIPATE')")
    public StandardAPIResponse<InstanceView> decide(@PathVariable UUID taskId, @Valid @RequestBody DecisionRequest req) {
        return StandardAPIResponse.success(engine.decide(CurrentUser.get(), taskId, req.decision(), req.comment()), "Decision recorded");
    }

    @PostMapping("/tasks/{taskId}/delegate")
    @PreAuthorize("hasAuthority('WORKFLOWS_PARTICIPATE')")
    public StandardAPIResponse<InstanceView> delegate(@PathVariable UUID taskId, @Valid @RequestBody DelegateRequest req) {
        return StandardAPIResponse.success(engine.delegate(CurrentUser.get(), taskId, req.toUserId(), req.comment()), "Task delegated");
    }

    @Operation(summary = "Publish an approved document")
    @PostMapping("/documents/{documentId}/publish")
    @PreAuthorize("hasAuthority('DOCUMENTS_EDIT')")
    public StandardAPIResponse<Void> publish(@PathVariable UUID documentId) {
        engine.publish(CurrentUser.get(), documentId);
        return StandardAPIResponse.success("Document published");
    }
}
