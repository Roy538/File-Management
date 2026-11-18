package com.manageedocs.reports.controller;

import com.manageedocs.common.dto.StandardAPIResponse;
import com.manageedocs.reports.dto.ReportDtos.Format;
import com.manageedocs.reports.dto.ReportDtos.ReportFile;
import com.manageedocs.reports.dto.ReportDtos.ReportParams;
import com.manageedocs.reports.dto.ReportDtos.ReportTable;
import com.manageedocs.reports.dto.ReportDtos.ReportType;
import com.manageedocs.reports.service.ReportService;
import com.manageedocs.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.UUID;

@Tag(name = "Reports")
@RestController
@RequestMapping("/api/v1/reports")
public class ReportController {

    private final ReportService reports;

    public ReportController(ReportService reports) {
        this.reports = reports;
    }

    @Operation(summary = "Run a registry report on screen (JSON)",
            description = "Reports: outstanding, daily-dispatches (date), daily-returns (date), missing, by-department, "
                    + "monthly (year, month), movement-history (fileId, from, to).")
    @GetMapping("/{type}")
    @PreAuthorize("hasAuthority('REPORTS_VIEW')")
    public StandardAPIResponse<ReportTable> view(@PathVariable String type,
                                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                                                 @RequestParam(required = false) Integer year,
                                                 @RequestParam(required = false) Integer month,
                                                 @RequestParam(required = false) UUID fileId,
                                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return StandardAPIResponse.success(reports.table(CurrentUser.get(), ReportType.fromSlug(type),
                new ReportParams(date, year, month, fileId, from, to)), "Report generated");
    }

    @Operation(summary = "Download a registry report as csv, xlsx or pdf")
    @GetMapping("/{type}/export")
    @PreAuthorize("hasAuthority('REPORTS_VIEW')")
    public ResponseEntity<byte[]> export(@PathVariable String type,
                                         @RequestParam String format,
                                         @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                                         @RequestParam(required = false) Integer year,
                                         @RequestParam(required = false) Integer month,
                                         @RequestParam(required = false) UUID fileId,
                                         @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                         @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        Format f = switch (format.toLowerCase()) {
            case "csv" -> Format.CSV;
            case "xlsx" -> Format.XLSX;
            case "pdf" -> Format.PDF;
            default -> throw new IllegalArgumentException("Format must be csv, xlsx or pdf");
        };
        ReportFile file = reports.export(CurrentUser.get(), ReportType.fromSlug(type),
                new ReportParams(date, year, month, fileId, from, to), f);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(file.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file.fileName()).build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header("X-Content-Type-Options", "nosniff")
                .body(file.bytes());
    }
}
