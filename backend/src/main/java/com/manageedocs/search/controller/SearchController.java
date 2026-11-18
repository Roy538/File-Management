package com.manageedocs.search.controller;

import com.manageedocs.common.dto.StandardAPIResponse;
import com.manageedocs.documents.model.Document;
import com.manageedocs.search.dto.SearchDtos.SearchQuery;
import com.manageedocs.search.dto.SearchDtos.SearchResult;
import com.manageedocs.search.service.SearchService;
import com.manageedocs.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.UUID;

@Tag(name = "Search")
@RestController
@RequestMapping("/api/v1/search")
public class SearchController {

    private final SearchService search;

    public SearchController(SearchService search) {
        this.search = search;
    }

    @Operation(summary = "Full-text + metadata search with facets; results are permission-filtered in the query")
    @GetMapping
    @PreAuthorize("hasAuthority('DOCUMENTS_VIEW')")
    public StandardAPIResponse<SearchResult> search(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) UUID cabinetId,
            @RequestParam(required = false) UUID folderId,
            @RequestParam(required = false) UUID documentTypeId,
            @RequestParam(required = false) Document.Status status,
            @RequestParam(required = false) UUID ownerId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate updatedFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate updatedTo,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size) {
        return StandardAPIResponse.success(search.search(CurrentUser.get(), new SearchQuery(q, cabinetId, folderId,
                documentTypeId, status, ownerId, updatedFrom, updatedTo, page, size)), "Search completed");
    }
}
