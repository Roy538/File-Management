package com.manageedocs.taxonomy.controller;

import com.manageedocs.common.dto.StandardAPIResponse;
import com.manageedocs.security.CurrentUser;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.FolderView;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.MoveFolderRequest;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.RenameRequest;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.SubDividerView;
import com.manageedocs.taxonomy.service.TaxonomyService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class FolderController {

    private final TaxonomyService taxonomy;

    public FolderController(TaxonomyService taxonomy) {
        this.taxonomy = taxonomy;
    }

    @PatchMapping("/folders/{id}")
    @PreAuthorize("hasAuthority('CABINETS_MANAGE')")
    public StandardAPIResponse<FolderView> rename(@PathVariable UUID id, @Valid @RequestBody RenameRequest req) {
        return StandardAPIResponse.success(taxonomy.renameFolder(CurrentUser.get(), id, req.name()), "Folder renamed");
    }

    @PostMapping("/folders/{id}/move")
    @PreAuthorize("hasAuthority('CABINETS_MANAGE')")
    public StandardAPIResponse<FolderView> move(@PathVariable UUID id, @RequestBody MoveFolderRequest req) {
        return StandardAPIResponse.success(taxonomy.moveFolder(CurrentUser.get(), id, req), "Folder moved");
    }

    @DeleteMapping("/folders/{id}")
    @PreAuthorize("hasAuthority('CABINETS_MANAGE')")
    public StandardAPIResponse<Void> delete(@PathVariable UUID id) {
        taxonomy.deleteFolder(CurrentUser.get(), id);
        return StandardAPIResponse.success("Folder deleted");
    }

    @PostMapping("/folders/{id}/sub-dividers")
    @PreAuthorize("hasAuthority('CABINETS_MANAGE')")
    public ResponseEntity<StandardAPIResponse<SubDividerView>> createSubDivider(@PathVariable UUID id,
                                                                               @Valid @RequestBody RenameRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(
                StandardAPIResponse.success(taxonomy.createSubDivider(CurrentUser.get(), id, req.name()), "Sub-divider created"));
    }

    @PatchMapping("/sub-dividers/{id}")
    @PreAuthorize("hasAuthority('CABINETS_MANAGE')")
    public StandardAPIResponse<SubDividerView> renameSubDivider(@PathVariable UUID id, @Valid @RequestBody RenameRequest req) {
        return StandardAPIResponse.success(taxonomy.renameSubDivider(CurrentUser.get(), id, req.name()), "Sub-divider renamed");
    }

    @DeleteMapping("/sub-dividers/{id}")
    @PreAuthorize("hasAuthority('CABINETS_MANAGE')")
    public StandardAPIResponse<Void> deleteSubDivider(@PathVariable UUID id) {
        taxonomy.deleteSubDivider(CurrentUser.get(), id);
        return StandardAPIResponse.success("Sub-divider deleted");
    }
}
