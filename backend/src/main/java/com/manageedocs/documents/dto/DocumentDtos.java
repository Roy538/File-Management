package com.manageedocs.documents.dto;

import com.manageedocs.documents.model.Document;
import com.manageedocs.documents.model.DocumentVersion;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** API contracts for documents and their versions. */
public final class DocumentDtos {

    private DocumentDtos() {
    }

    public record DocumentSummary(UUID id, String title, Document.Status status, UUID folderId, UUID subDividerId,
                                  UUID documentTypeId, int currentVersionNo, String fileName, String contentType,
                                  long sizeBytes, Instant updatedAt, UUID lockedBy, List<String> rights) {
    }

    public record LockView(UUID lockedBy, Instant lockedAt, Instant expiresAt, boolean byYou) {
    }

    public record VersionView(int versionNo, String fileName, String contentType, long sizeBytes, String sha256,
                              DocumentVersion.ProcessingStatus processingStatus, String comment,
                              Integer restoredFromNo, UUID createdBy, Instant createdAt) {
        public static VersionView of(DocumentVersion v) {
            return new VersionView(v.getVersionNo(), v.getOriginalFilename(), v.getContentType(), v.getSizeBytes(),
                    v.getSha256(), v.getProcessingStatus(), v.getChangeComment(), v.getRestoredFromNo(),
                    v.getCreatedBy(), v.getCreatedAt());
        }
    }

    public record DocumentDetail(UUID id, String title, Document.Status status, UUID cabinetId, UUID folderId,
                                 UUID subDividerId, UUID documentTypeId, int currentVersionNo, UUID ownerId,
                                 LockView lock, List<Map<String, String>> metadata, List<VersionView> versions,
                                 List<String> rights, long entityVersion, boolean onLegalHold, Instant archivedAt,
                                 Instant createdAt, Instant updatedAt) {
    }

    /** Upload result; {@code possibleDuplicates} lists visible documents with byte-identical content. */
    public record UploadResult(DocumentDetail document, List<UUID> possibleDuplicates) {
    }

    /**
     * {@code entityVersion} (from DocumentDetail) enables optimistic concurrency: if someone else
     * changed the document meanwhile, the update fails with 409 instead of overwriting their change.
     */
    public record UpdateDocumentRequest(
            @NotBlank @Size(max = 300) String title,
            UUID documentTypeId,
            Map<String, String> metadata,
            Long entityVersion) {
    }

    public record RestoreRequest(@Size(max = 1000) String comment) {
    }

    public record DownloadLink(String url, Instant expiresAt, String fileName, String contentType) {
    }
}
