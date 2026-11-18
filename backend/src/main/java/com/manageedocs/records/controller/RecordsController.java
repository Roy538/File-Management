package com.manageedocs.records.controller;

import com.manageedocs.common.dto.PagedResponse;
import com.manageedocs.common.dto.StandardAPIResponse;
import com.manageedocs.records.dto.RecordsDtos.CreateFileRequest;
import com.manageedocs.records.dto.RecordsDtos.CreateFileRequestRequest;
import com.manageedocs.records.dto.RecordsDtos.DecisionRequest;
import com.manageedocs.records.dto.RecordsDtos.DispatchFileRequest;
import com.manageedocs.records.dto.RecordsDtos.DispatchView;
import com.manageedocs.records.dto.RecordsDtos.FileDetail;
import com.manageedocs.records.dto.RecordsDtos.FileSummary;
import com.manageedocs.records.dto.RecordsDtos.RequestView;
import com.manageedocs.records.dto.RecordsDtos.ReturnFileRequest;
import com.manageedocs.records.dto.RecordsDtos.StatusChangeRequest;
import com.manageedocs.records.dto.RecordsDtos.UpdateFileRequest;
import com.manageedocs.records.model.FileRequest;
import com.manageedocs.records.model.PhysicalFile;
import com.manageedocs.records.service.FileRequestService;
import com.manageedocs.records.service.RegistryService;
import com.manageedocs.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@Tag(name = "Physical records")
@RestController
@RequestMapping("/api/v1/records")
public class RecordsController {

    private final RegistryService registry;
    private final FileRequestService requests;

    public RecordsController(RegistryService registry, FileRequestService requests) {
        this.registry = registry;
        this.requests = requests;
    }

    // ── Files ─────────────────────────────────────────────────────────────

    @Operation(summary = "Search the file register by number or customer, status and department")
    @GetMapping("/files")
    @PreAuthorize("hasAuthority('RECORDS_VIEW')")
    public StandardAPIResponse<PagedResponse<FileSummary>> files(@RequestParam(required = false) String q,
                                                                 @RequestParam(required = false) PhysicalFile.Status status,
                                                                 @RequestParam(required = false) UUID departmentId,
                                                                 @RequestParam(defaultValue = "0") int page,
                                                                 @RequestParam(defaultValue = "25") int size) {
        return StandardAPIResponse.success(registry.list(q, status, departmentId, page, size), "Files retrieved");
    }

    @PostMapping("/files")
    @PreAuthorize("hasAuthority('RECORDS_MANAGE')")
    public ResponseEntity<StandardAPIResponse<FileSummary>> create(@Valid @RequestBody CreateFileRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(StandardAPIResponse.success(registry.create(CurrentUser.get(), req), "File registered"));
    }

    @Operation(summary = "A file with its open loan, movement history, active requests and the caller's allowed actions")
    @GetMapping("/files/{id}")
    @PreAuthorize("hasAuthority('RECORDS_VIEW')")
    public StandardAPIResponse<FileDetail> file(@PathVariable UUID id) {
        return StandardAPIResponse.success(registry.get(CurrentUser.get(), id), "File retrieved");
    }

    @PatchMapping("/files/{id}")
    @PreAuthorize("hasAuthority('RECORDS_MANAGE')")
    public StandardAPIResponse<FileSummary> update(@PathVariable UUID id, @Valid @RequestBody UpdateFileRequest req) {
        return StandardAPIResponse.success(registry.update(CurrentUser.get(), id, req), "File updated");
    }

    @GetMapping("/files/{id}/dispatches")
    @PreAuthorize("hasAuthority('RECORDS_VIEW')")
    public StandardAPIResponse<List<DispatchView>> loans(@PathVariable UUID id) {
        return StandardAPIResponse.success(registry.history(id), "Loans retrieved");
    }

    @PostMapping("/files/{id}/dispatch")
    @PreAuthorize("hasAuthority('RECORDS_DISPATCH')")
    public StandardAPIResponse<DispatchView> dispatch(@PathVariable UUID id, @Valid @RequestBody DispatchFileRequest req) {
        return StandardAPIResponse.success(registry.dispatch(CurrentUser.get(), id, req), "File dispatched");
    }

    @PostMapping("/files/{id}/return")
    @PreAuthorize("hasAuthority('RECORDS_DISPATCH')")
    public StandardAPIResponse<DispatchView> receive(@PathVariable UUID id, @Valid @RequestBody ReturnFileRequest req) {
        return StandardAPIResponse.success(registry.receive(CurrentUser.get(), id, req), "Return recorded");
    }

    @Operation(summary = "Shelve, relocate, archive, flag missing, recover, or (administrators) restore from archive")
    @PostMapping("/files/{id}/status")
    @PreAuthorize("hasAnyAuthority('RECORDS_MANAGE','RECORDS_DISPATCH')")
    public StandardAPIResponse<FileSummary> status(@PathVariable UUID id, @Valid @RequestBody StatusChangeRequest req) {
        return StandardAPIResponse.success(registry.changeStatus(CurrentUser.get(), id, req), "File updated");
    }

    @Operation(summary = "Files currently out on loan, oldest first")
    @GetMapping("/dispatches/outstanding")
    @PreAuthorize("hasAuthority('RECORDS_VIEW')")
    public StandardAPIResponse<List<DispatchView>> outstanding(@RequestParam(defaultValue = "false") boolean overdueOnly) {
        return StandardAPIResponse.success(registry.outstanding(overdueOnly), "Outstanding files retrieved");
    }

    // ── Requests ──────────────────────────────────────────────────────────

    @Operation(summary = "Borrowing requests: registry staff see all, others only their own")
    @GetMapping("/requests")
    @PreAuthorize("hasAnyAuthority('RECORDS_REQUEST','RECORDS_DISPATCH')")
    public StandardAPIResponse<PagedResponse<RequestView>> requests(@RequestParam(required = false) FileRequest.Status status,
                                                                    @RequestParam(defaultValue = "false") boolean mine,
                                                                    @RequestParam(defaultValue = "0") int page,
                                                                    @RequestParam(defaultValue = "25") int size) {
        return StandardAPIResponse.success(requests.list(CurrentUser.get(), status, mine, page, size), "Requests retrieved");
    }

    @PostMapping("/requests")
    @PreAuthorize("hasAuthority('RECORDS_REQUEST')")
    public ResponseEntity<StandardAPIResponse<RequestView>> request(@Valid @RequestBody CreateFileRequestRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(StandardAPIResponse.success(requests.create(CurrentUser.get(), req), "Request sent"));
    }

    @PostMapping("/requests/{id}/approve")
    @PreAuthorize("hasAuthority('RECORDS_DISPATCH')")
    public StandardAPIResponse<RequestView> approve(@PathVariable UUID id, @Valid @RequestBody(required = false) DecisionRequest req) {
        return StandardAPIResponse.success(requests.decide(CurrentUser.get(), id, true, req == null ? null : req.notes()), "Request approved");
    }

    @PostMapping("/requests/{id}/reject")
    @PreAuthorize("hasAuthority('RECORDS_DISPATCH')")
    public StandardAPIResponse<RequestView> reject(@PathVariable UUID id, @Valid @RequestBody DecisionRequest req) {
        return StandardAPIResponse.success(requests.decide(CurrentUser.get(), id, false, req.notes()), "Request rejected");
    }

    @PostMapping("/requests/{id}/cancel")
    @PreAuthorize("hasAnyAuthority('RECORDS_REQUEST','RECORDS_DISPATCH')")
    public StandardAPIResponse<RequestView> cancel(@PathVariable UUID id) {
        return StandardAPIResponse.success(requests.cancel(CurrentUser.get(), id), "Request cancelled");
    }
}
