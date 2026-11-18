package com.manageedocs.taxonomy.controller;

import com.manageedocs.common.dto.StandardAPIResponse;
import com.manageedocs.security.CurrentUser;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.CreateDocumentTypeRequest;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.DocumentTypeView;
import com.manageedocs.taxonomy.service.DocumentTypeService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/document-types")
public class DocumentTypeController {

    private final DocumentTypeService types;

    public DocumentTypeController(DocumentTypeService types) {
        this.types = types;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('DOCUMENTS_VIEW')")
    public StandardAPIResponse<List<DocumentTypeView>> list() {
        return StandardAPIResponse.success(types.list(), "Document types retrieved");
    }

    @PostMapping
    @PreAuthorize("hasAuthority('DOCUMENT_TYPES_MANAGE')")
    public ResponseEntity<StandardAPIResponse<DocumentTypeView>> create(@Valid @RequestBody CreateDocumentTypeRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(StandardAPIResponse.success(types.create(CurrentUser.get(), req), "Document type created"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('DOCUMENT_TYPES_MANAGE')")
    public StandardAPIResponse<Void> deactivate(@PathVariable UUID id) {
        types.deactivate(CurrentUser.get(), id);
        return StandardAPIResponse.success("Document type deactivated");
    }
}
