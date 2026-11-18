package com.manageedocs.documents.controller;

import com.manageedocs.common.dto.PagedResponse;
import com.manageedocs.common.dto.StandardAPIResponse;
import com.manageedocs.documents.dto.DocumentDtos.DocumentDetail;
import com.manageedocs.documents.dto.DocumentDtos.DocumentSummary;
import com.manageedocs.documents.dto.DocumentDtos.DownloadLink;
import com.manageedocs.documents.dto.DocumentDtos.RestoreRequest;
import com.manageedocs.documents.dto.DocumentDtos.UpdateDocumentRequest;
import com.manageedocs.documents.dto.DocumentDtos.UploadResult;
import com.manageedocs.documents.service.DocumentService;
import com.manageedocs.documents.service.DocumentService.UploadCommand;
import com.manageedocs.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;
import java.util.UUID;

/**
 * Layer 1 here ({@code @PreAuthorize} capability); layer 2 in {@link DocumentService} (the caller's
 * rights on this specific document via cabinet visibility and ACL grants).
 */
@Tag(name = "Documents")
@RestController
@RequestMapping("/api/v1/documents")
public class DocumentController {

    private final DocumentService documents;

    public DocumentController(DocumentService documents) {
        this.documents = documents;
    }

    @Operation(summary = "Documents in a folder (optionally a sub-divider), newest first; q filters by title")
    @GetMapping
    @PreAuthorize("hasAuthority('DOCUMENTS_VIEW')")
    public StandardAPIResponse<PagedResponse<DocumentSummary>> list(
            @RequestParam UUID folderId,
            @RequestParam(required = false) UUID subDividerId,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size) {
        return StandardAPIResponse.success(documents.list(CurrentUser.get(), folderId, subDividerId, q, page, size),
                "Documents retrieved");
    }

    @Operation(summary = "Upload a new document (multipart: file, folderId, optional subDividerId/title/documentTypeId, JSON part 'metadata')")
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAuthority('DOCUMENTS_UPLOAD')")
    public ResponseEntity<StandardAPIResponse<UploadResult>> upload(
            @RequestPart("file") MultipartFile file,
            @RequestParam UUID folderId,
            @RequestParam(required = false) UUID subDividerId,
            @RequestParam(required = false) String title,
            @RequestParam(required = false) UUID documentTypeId,
            @RequestPart(name = "metadata", required = false) Map<String, String> metadata) {
        UploadResult result = documents.upload(CurrentUser.get(),
                new UploadCommand(folderId, subDividerId, title, documentTypeId, metadata), file);
        String msg = result.possibleDuplicates().isEmpty() ? "Document uploaded"
                : "Document uploaded. Identical content already exists in " + result.possibleDuplicates().size() + " other document(s).";
        return ResponseEntity.status(HttpStatus.CREATED).body(StandardAPIResponse.success(result, msg));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('DOCUMENTS_VIEW')")
    public StandardAPIResponse<DocumentDetail> get(@PathVariable UUID id) {
        return StandardAPIResponse.success(documents.get(CurrentUser.get(), id), "Document retrieved");
    }

    @Operation(summary = "Edit title, document type and metadata (optimistic concurrency via entityVersion)")
    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('DOCUMENTS_EDIT')")
    public StandardAPIResponse<DocumentDetail> update(@PathVariable UUID id, @Valid @RequestBody UpdateDocumentRequest req) {
        return StandardAPIResponse.success(documents.update(CurrentUser.get(), id, req), "Document updated");
    }

    @Operation(summary = "Upload a new version; never overwrites earlier versions")
    @PostMapping(value = "/{id}/versions", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAuthority('DOCUMENTS_EDIT')")
    public ResponseEntity<StandardAPIResponse<DocumentDetail>> addVersion(
            @PathVariable UUID id,
            @RequestPart("file") MultipartFile file,
            @RequestParam(required = false) String comment,
            @RequestParam(required = false) Integer expectedCurrentVersionNo,
            @RequestParam(defaultValue = "false") boolean keepLock) {
        return ResponseEntity.status(HttpStatus.CREATED).body(StandardAPIResponse.success(
                documents.addVersion(CurrentUser.get(), id, file, comment, expectedCurrentVersionNo, keepLock),
                "New version uploaded"));
    }

    @Operation(summary = "Restore an earlier version as a new version")
    @PostMapping("/{id}/versions/{versionNo}/restore")
    @PreAuthorize("hasAuthority('DOCUMENTS_EDIT')")
    public StandardAPIResponse<DocumentDetail> restore(@PathVariable UUID id, @PathVariable int versionNo,
                                                       @Valid @RequestBody(required = false) RestoreRequest req) {
        return StandardAPIResponse.success(documents.restore(CurrentUser.get(), id, versionNo,
                req == null ? null : req.comment()), "Version " + versionNo + " restored");
    }

    @Operation(summary = "Short-lived download (or inline preview) link for the current or a given version")
    @GetMapping("/{id}/content-url")
    @PreAuthorize("hasAuthority('DOCUMENTS_DOWNLOAD')")
    public StandardAPIResponse<DownloadLink> contentUrl(@PathVariable UUID id,
                                                       @RequestParam(required = false) Integer version,
                                                       @RequestParam(defaultValue = "false") boolean inline) {
        return StandardAPIResponse.success(documents.downloadLink(CurrentUser.get(), id, version, inline), "Link issued");
    }

    @PostMapping("/{id}/checkout")
    @PreAuthorize("hasAuthority('DOCUMENTS_EDIT')")
    public StandardAPIResponse<DocumentDetail> checkOut(@PathVariable UUID id) {
        return StandardAPIResponse.success(documents.checkOut(CurrentUser.get(), id), "Document checked out");
    }

    @PostMapping("/{id}/release")
    @PreAuthorize("hasAuthority('DOCUMENTS_VIEW')")
    public StandardAPIResponse<DocumentDetail> release(@PathVariable UUID id) {
        return StandardAPIResponse.success(documents.release(CurrentUser.get(), id), "Document released");
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('DOCUMENTS_DELETE')")
    public StandardAPIResponse<Void> delete(@PathVariable UUID id) {
        documents.delete(CurrentUser.get(), id);
        return StandardAPIResponse.success("Document deleted");
    }
}
