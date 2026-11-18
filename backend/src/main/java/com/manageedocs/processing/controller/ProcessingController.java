package com.manageedocs.processing.controller;

import com.manageedocs.common.dto.StandardAPIResponse;
import com.manageedocs.processing.model.ProcessingJob;
import com.manageedocs.processing.service.ProcessingAdminService;
import com.manageedocs.processing.service.ProcessingAdminService.JobView;
import com.manageedocs.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Tag(name = "Processing")
@RestController
@RequestMapping("/api/v1")
public class ProcessingController {

    private final ProcessingAdminService processing;

    public ProcessingController(ProcessingAdminService processing) {
        this.processing = processing;
    }

    @Operation(summary = "Scan/extraction history for each version of a document")
    @GetMapping("/documents/{id}/processing")
    @PreAuthorize("hasAuthority('DOCUMENTS_VIEW')")
    public StandardAPIResponse<List<JobView>> history(@PathVariable UUID id) {
        return StandardAPIResponse.success(processing.history(CurrentUser.get(), id), "Processing history retrieved");
    }

    @PostMapping("/documents/{id}/reprocess")
    @PreAuthorize("hasAuthority('PROCESSING_MANAGE')")
    public StandardAPIResponse<Void> reprocess(@PathVariable UUID id) {
        processing.reprocess(CurrentUser.get(), id);
        return StandardAPIResponse.success("Document queued for processing");
    }

    @Operation(summary = "Rebuild the organisation's search index (reprocesses every current version)")
    @PostMapping("/processing/reindex")
    @PreAuthorize("hasAuthority('PROCESSING_MANAGE')")
    public StandardAPIResponse<Map<String, Integer>> reindex() {
        return StandardAPIResponse.success(Map.of("queued", processing.reindexAll(CurrentUser.get())), "Re-index queued");
    }

    @GetMapping("/processing/stats")
    @PreAuthorize("hasAuthority('PROCESSING_MANAGE')")
    public StandardAPIResponse<Map<ProcessingJob.Status, Long>> stats() {
        return StandardAPIResponse.success(processing.stats(CurrentUser.get()), "Queue statistics");
    }
}
