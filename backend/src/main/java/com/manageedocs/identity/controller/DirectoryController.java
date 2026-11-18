package com.manageedocs.identity.controller;

import com.manageedocs.common.dto.StandardAPIResponse;
import com.manageedocs.identity.service.DirectoryService;
import com.manageedocs.identity.service.DirectoryService.Person;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Display names for people referenced elsewhere (version authors, reviewers, lock holders) so the
 * UI never shows raw ids. Deliberately narrow: lookup by known ids only (no listing, no search, no
 * emails), so it cannot be used to enumerate an organisation's staff.
 */
@Tag(name = "Directory")
@RestController
@RequestMapping("/api/v1/directory")
public class DirectoryController {

    private final DirectoryService directory;

    public DirectoryController(DirectoryService directory) {
        this.directory = directory;
    }

    @Operation(summary = "Names for up to 100 user ids in your organisation (unknown ids are omitted)")
    @GetMapping("/people")
    @PreAuthorize("isAuthenticated()")
    public StandardAPIResponse<List<Person>> people(@RequestParam List<UUID> ids) {
        return StandardAPIResponse.success(directory.people(ids), "People retrieved");
    }
}
