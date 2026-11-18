package com.manageedocs.records.dto;

import com.manageedocs.records.model.FileDispatch;
import com.manageedocs.records.model.FileMovement;
import com.manageedocs.records.model.FileRequest;
import com.manageedocs.records.model.PhysicalFile;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class RecordsDtos {

    private RecordsDtos() {
    }

    // ── Files ─────────────────────────────────────────────────────────────

    public record CreateFileRequest(
            @NotBlank @Size(max = 64) @Pattern(regexp = "[A-Za-z0-9][A-Za-z0-9/._-]*",
                    message = "use letters, digits and / . _ - only") String fileNumber,
            @NotBlank @Size(max = 200) String customerName,
            UUID departmentId,
            @NotNull @PastOrPresent LocalDate dateOpened,
            @Min(1) @Max(999) Integer volumeNumber,
            @Size(max = 200) String homeLocation) {
    }

    public record UpdateFileRequest(
            @Size(max = 200) String customerName,
            UUID departmentId,
            @Size(max = 200) String homeLocation) {
    }

    public record FileSummary(UUID id, String fileNumber, int volumeNumber, String customerName, UUID departmentId,
                              String departmentName, LocalDate dateOpened, PhysicalFile.Status status,
                              String currentLocation, String homeLocation, Instant updatedAt) {
    }

    public record FileDetail(FileSummary file, DispatchView openDispatch, List<MovementView> movements,
                             List<RequestView> activeRequests, List<String> allowedActions) {
    }

    /** Status changes other than dispatch and return. */
    public enum StatusAction { SHELVE, RELOCATE, ARCHIVE, FLAG_MISSING, RECOVER, RESTORE }

    public record StatusChangeRequest(
            @NotNull StatusAction action,
            @Size(max = 200) String location,
            @Size(max = 1000) String notes) {
    }

    public record MovementView(UUID id, FileMovement.Action action, UUID performedBy, String department,
                               String fromLocation, String toLocation, String notes, Instant occurredAt) {
        public static MovementView of(FileMovement m) {
            return new MovementView(m.getId(), m.getAction(), m.getPerformedBy(), m.getDepartment(),
                    m.getFromLocation(), m.getToLocation(), m.getNotes(), m.getOccurredAt());
        }
    }

    // ── Loans ─────────────────────────────────────────────────────────────

    public record DispatchFileRequest(
            @NotBlank @Size(max = 200) String dispatchedTo,
            @NotBlank @Size(max = 200) String department,
            @Size(max = 1000) String reason,
            LocalDate expectedReturnOn,
            UUID authorisedBy,
            UUID requestId) {
    }

    public record ReturnFileRequest(
            @NotBlank @Size(max = 200) String returnedByName,
            @NotNull FileDispatch.Condition condition,
            boolean returnedToCorrectLocation,
            @Size(max = 200) String location,
            @Size(max = 1000) String notes) {
    }

    public record DispatchView(UUID id, UUID fileId, String fileNumber, String customerName, String dispatchedTo,
                               String department, String reason, UUID dispatchedBy, UUID authorisedBy,
                               Instant dispatchedAt, LocalDate expectedReturnOn, boolean overdue, UUID requestId,
                               Instant returnedAt, UUID receivedBy, String returnedByName,
                               FileDispatch.Condition returnCondition, Boolean returnedToCorrectLocation,
                               String returnLocation, String returnNotes) {
    }

    // ── Requests ──────────────────────────────────────────────────────────

    public record CreateFileRequestRequest(
            @NotNull UUID fileId,
            @NotBlank @Size(max = 200) String department,
            @Size(max = 1000) String purpose,
            LocalDate neededBy) {
    }

    public record DecisionRequest(@Size(max = 1000) String notes) {
    }

    public record RequestView(UUID id, UUID fileId, String fileNumber, String customerName,
                              PhysicalFile.Status fileStatus, UUID requestedBy, String department, String purpose,
                              LocalDate neededBy, FileRequest.Status status, UUID decidedBy, Instant decidedAt,
                              String decisionNotes, UUID dispatchId, Instant createdAt) {
    }
}
