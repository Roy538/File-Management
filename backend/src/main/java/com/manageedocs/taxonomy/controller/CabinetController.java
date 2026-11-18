package com.manageedocs.taxonomy.controller;

import com.manageedocs.common.dto.StandardAPIResponse;
import com.manageedocs.security.CurrentUser;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.CabinetTree;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.CabinetView;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.CreateCabinetRequest;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.CreateFolderRequest;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.FolderView;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.UpdateCabinetRequest;
import com.manageedocs.taxonomy.model.Cabinet;
import com.manageedocs.taxonomy.service.TaxonomyService;
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

@Tag(name = "Cabinets")
@RestController
@RequestMapping("/api/v1/cabinets")
public class CabinetController {

    private final TaxonomyService taxonomy;

    public CabinetController(TaxonomyService taxonomy) {
        this.taxonomy = taxonomy;
    }

    @Operation(summary = "Cabinets visible to the caller, optionally filtered by visibility (Personal/Private/Default)")
    @GetMapping
    @PreAuthorize("hasAuthority('CABINETS_VIEW')")
    public StandardAPIResponse<List<CabinetView>> list(@RequestParam(required = false) Cabinet.Visibility scope) {
        return StandardAPIResponse.success(taxonomy.listCabinets(CurrentUser.get(), scope), "Cabinets retrieved");
    }

    @PostMapping
    @PreAuthorize("hasAuthority('CABINETS_MANAGE')")
    public ResponseEntity<StandardAPIResponse<CabinetView>> create(@Valid @RequestBody CreateCabinetRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(StandardAPIResponse.success(taxonomy.createCabinet(CurrentUser.get(), req), "Cabinet created"));
    }

    @Operation(summary = "Cabinet with its folder tree and sub-dividers; each node carries the caller's rights")
    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('CABINETS_VIEW')")
    public StandardAPIResponse<CabinetTree> tree(@PathVariable UUID id) {
        return StandardAPIResponse.success(taxonomy.tree(CurrentUser.get(), id), "Cabinet retrieved");
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('CABINETS_MANAGE')")
    public StandardAPIResponse<CabinetView> update(@PathVariable UUID id, @Valid @RequestBody UpdateCabinetRequest req) {
        return StandardAPIResponse.success(taxonomy.updateCabinet(CurrentUser.get(), id, req), "Cabinet updated");
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('CABINETS_MANAGE')")
    public StandardAPIResponse<Void> delete(@PathVariable UUID id) {
        taxonomy.deleteCabinet(CurrentUser.get(), id);
        return StandardAPIResponse.success("Cabinet deleted");
    }

    @Operation(summary = "Create a folder at the cabinet root or under parentId")
    @PostMapping("/{id}/folders")
    @PreAuthorize("hasAuthority('CABINETS_MANAGE')")
    public ResponseEntity<StandardAPIResponse<FolderView>> createFolder(@PathVariable UUID id,
                                                                       @Valid @RequestBody CreateFolderRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(StandardAPIResponse.success(taxonomy.createFolder(CurrentUser.get(), id, req), "Folder created"));
    }
}
