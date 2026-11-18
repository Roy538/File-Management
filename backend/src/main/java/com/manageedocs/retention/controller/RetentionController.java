package com.manageedocs.retention.controller;

import com.manageedocs.common.dto.StandardAPIResponse;
import com.manageedocs.retention.dto.RetentionDtos.AddToHoldRequest;
import com.manageedocs.retention.dto.RetentionDtos.ApproveRunRequest;
import com.manageedocs.retention.dto.RetentionDtos.AssignPolicyRequest;
import com.manageedocs.retention.dto.RetentionDtos.CreateHoldRequest;
import com.manageedocs.retention.dto.RetentionDtos.CreatePolicyRequest;
import com.manageedocs.retention.dto.RetentionDtos.DispositionRunView;
import com.manageedocs.retention.dto.RetentionDtos.DueDocument;
import com.manageedocs.retention.dto.RetentionDtos.EvaluationResult;
import com.manageedocs.retention.dto.RetentionDtos.HoldView;
import com.manageedocs.retention.dto.RetentionDtos.PolicyView;
import com.manageedocs.retention.dto.RetentionDtos.ReleaseHoldRequest;
import com.manageedocs.retention.service.DispositionService;
import com.manageedocs.retention.service.LegalHoldService;
import com.manageedocs.retention.service.RetentionService;
import com.manageedocs.security.CurrentUser;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@Tag(name = "Retention & legal holds")
@RestController
@RequestMapping("/api/v1")
public class RetentionController {

    private final RetentionService retention;
    private final DispositionService disposition;
    private final LegalHoldService holds;

    public RetentionController(RetentionService retention, DispositionService disposition, LegalHoldService holds) {
        this.retention = retention;
        this.disposition = disposition;
        this.holds = holds;
    }

    // ── Policies ──────────────────────────────────────────────────────────

    @GetMapping("/retention/policies")
    @PreAuthorize("hasAuthority('RETENTION_MANAGE')")
    public StandardAPIResponse<List<PolicyView>> policies() {
        return StandardAPIResponse.success(retention.list(), "Retention policies retrieved");
    }

    @PostMapping("/retention/policies")
    @PreAuthorize("hasAuthority('RETENTION_MANAGE')")
    public ResponseEntity<StandardAPIResponse<PolicyView>> createPolicy(@Valid @RequestBody CreatePolicyRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(StandardAPIResponse.success(retention.create(CurrentUser.get(), req), "Retention policy created"));
    }

    @DeleteMapping("/retention/policies/{id}")
    @PreAuthorize("hasAuthority('RETENTION_MANAGE')")
    public StandardAPIResponse<Void> deactivatePolicy(@PathVariable UUID id) {
        retention.deactivate(CurrentUser.get(), id);
        return StandardAPIResponse.success("Retention policy deactivated");
    }

    @PutMapping("/retention/cabinets/{cabinetId}/policy")
    @PreAuthorize("hasAuthority('RETENTION_MANAGE')")
    public StandardAPIResponse<Void> assignCabinet(@PathVariable UUID cabinetId, @RequestBody AssignPolicyRequest req) {
        retention.assignToCabinet(CurrentUser.get(), cabinetId, req.policyId());
        return StandardAPIResponse.success("Retention policy assigned");
    }

    @PutMapping("/retention/document-types/{typeId}/policy")
    @PreAuthorize("hasAuthority('RETENTION_MANAGE')")
    public StandardAPIResponse<Void> assignType(@PathVariable UUID typeId, @RequestBody AssignPolicyRequest req) {
        retention.assignToDocumentType(CurrentUser.get(), typeId, req.policyId());
        return StandardAPIResponse.success("Retention policy assigned");
    }

    @Operation(summary = "Documents due for archival/destruction now or within N days")
    @GetMapping("/retention/due")
    @PreAuthorize("hasAuthority('RETENTION_MANAGE')")
    public StandardAPIResponse<List<DueDocument>> due(@RequestParam(defaultValue = "30") int withinDays) {
        return StandardAPIResponse.success(retention.due(withinDays), "Due documents retrieved");
    }

    // ── Disposition ───────────────────────────────────────────────────────

    @Operation(summary = "Evaluate policies now: archive what is due, propose destruction for approval")
    @PostMapping("/retention/evaluate")
    @PreAuthorize("hasAuthority('RETENTION_MANAGE')")
    public StandardAPIResponse<EvaluationResult> evaluate() {
        return StandardAPIResponse.success(disposition.evaluate(CurrentUser.get()), "Retention evaluated");
    }

    @GetMapping("/retention/runs")
    @PreAuthorize("hasAuthority('RETENTION_MANAGE')")
    public StandardAPIResponse<List<DispositionRunView>> runs() {
        return StandardAPIResponse.success(disposition.list(), "Disposition runs retrieved");
    }

    @GetMapping("/retention/runs/{id}")
    @PreAuthorize("hasAuthority('RETENTION_MANAGE')")
    public StandardAPIResponse<DispositionRunView> run(@PathVariable UUID id) {
        return StandardAPIResponse.success(disposition.view(id), "Disposition run retrieved");
    }

    @Operation(summary = "Approve and execute a proposed disposition run (irreversible destruction)")
    @PostMapping("/retention/runs/{id}/approve")
    @PreAuthorize("hasAuthority('RETENTION_MANAGE')")
    public StandardAPIResponse<DispositionRunView> approve(@PathVariable UUID id,
                                                          @RequestBody(required = false) ApproveRunRequest req) {
        return StandardAPIResponse.success(disposition.approve(CurrentUser.get(), id,
                req == null ? null : req.excludeDocumentIds()), "Disposition executed");
    }

    @PostMapping("/retention/runs/{id}/cancel")
    @PreAuthorize("hasAuthority('RETENTION_MANAGE')")
    public StandardAPIResponse<DispositionRunView> cancel(@PathVariable UUID id) {
        return StandardAPIResponse.success(disposition.cancel(CurrentUser.get(), id), "Disposition run cancelled");
    }

    // ── Legal holds ───────────────────────────────────────────────────────

    @GetMapping("/legal-holds")
    @PreAuthorize("hasAuthority('LEGAL_HOLD_MANAGE')")
    public StandardAPIResponse<List<HoldView>> holds() {
        return StandardAPIResponse.success(holds.list(), "Legal holds retrieved");
    }

    @PostMapping("/legal-holds")
    @PreAuthorize("hasAuthority('LEGAL_HOLD_MANAGE')")
    public ResponseEntity<StandardAPIResponse<HoldView>> createHold(@Valid @RequestBody CreateHoldRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(StandardAPIResponse.success(holds.create(CurrentUser.get(), req), "Legal hold created"));
    }

    @GetMapping("/legal-holds/{id}")
    @PreAuthorize("hasAuthority('LEGAL_HOLD_MANAGE')")
    public StandardAPIResponse<HoldView> hold(@PathVariable UUID id) {
        return StandardAPIResponse.success(holds.get(id), "Legal hold retrieved");
    }

    @PostMapping("/legal-holds/{id}/documents")
    @PreAuthorize("hasAuthority('LEGAL_HOLD_MANAGE')")
    public StandardAPIResponse<HoldView> addToHold(@PathVariable UUID id, @RequestBody AddToHoldRequest req) {
        return StandardAPIResponse.success(holds.addDocuments(CurrentUser.get(), id, req), "Documents placed on hold");
    }

    @DeleteMapping("/legal-holds/{id}/documents/{documentId}")
    @PreAuthorize("hasAuthority('LEGAL_HOLD_MANAGE')")
    public StandardAPIResponse<HoldView> removeFromHold(@PathVariable UUID id, @PathVariable UUID documentId) {
        return StandardAPIResponse.success(holds.removeDocument(CurrentUser.get(), id, documentId), "Document removed from hold");
    }

    @PostMapping("/legal-holds/{id}/release")
    @PreAuthorize("hasAuthority('LEGAL_HOLD_MANAGE')")
    public StandardAPIResponse<HoldView> release(@PathVariable UUID id, @Valid @RequestBody ReleaseHoldRequest req) {
        return StandardAPIResponse.success(holds.release(CurrentUser.get(), id, req.reason()), "Legal hold released");
    }
}
