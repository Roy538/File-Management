package com.manageedocs.records.model;

import com.manageedocs.common.persistence.TenantScopedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** One loan of a physical file. The return is recorded on the same row; open = not yet returned. */
@Entity
@Table(name = "file_dispatch")
public class FileDispatch extends TenantScopedEntity {

    public enum Condition { GOOD, WORN, DAMAGED, INCOMPLETE }

    @Column(name = "file_id", nullable = false)
    private UUID fileId;

    @Column(name = "dispatched_by", nullable = false)
    private UUID dispatchedBy;

    @Column(name = "authorised_by")
    private UUID authorisedBy;

    @Column(name = "dispatched_to", nullable = false, length = 200)
    private String dispatchedTo;

    @Column(nullable = false, length = 200)
    private String department;

    @Column(length = 1000)
    private String reason;

    @Column(name = "dispatched_at", nullable = false)
    private Instant dispatchedAt;

    @Column(name = "expected_return_on")
    private LocalDate expectedReturnOn;

    @Column(name = "request_id")
    private UUID requestId;

    @Column(name = "returned_at")
    private Instant returnedAt;

    @Column(name = "received_by")
    private UUID receivedBy;

    @Column(name = "returned_by_name", length = 200)
    private String returnedByName;

    @Enumerated(EnumType.STRING)
    @Column(name = "return_condition", length = 16)
    private Condition returnCondition;

    @Column(name = "returned_to_correct_location")
    private Boolean returnedToCorrectLocation;

    @Column(name = "return_location", length = 200)
    private String returnLocation;

    @Column(name = "return_notes", length = 1000)
    private String returnNotes;

    @Column(name = "overdue_notified_on")
    private LocalDate overdueNotifiedOn;

    protected FileDispatch() {
    }

    public FileDispatch(UUID fileId, UUID dispatchedBy, UUID authorisedBy, String dispatchedTo, String department,
                        String reason, Instant dispatchedAt, LocalDate expectedReturnOn, UUID requestId) {
        this.fileId = fileId;
        this.dispatchedBy = dispatchedBy;
        this.authorisedBy = authorisedBy;
        this.dispatchedTo = dispatchedTo.trim();
        this.department = department.trim();
        this.reason = reason == null || reason.isBlank() ? null : reason.trim();
        this.dispatchedAt = dispatchedAt;
        this.expectedReturnOn = expectedReturnOn;
        this.requestId = requestId;
    }

    public boolean isOpen() {
        return returnedAt == null;
    }

    public boolean isOverdue(LocalDate today) {
        return isOpen() && expectedReturnOn != null && expectedReturnOn.isBefore(today);
    }

    public void recordReturn(UUID receivedBy, String returnedByName, Condition condition, boolean correctLocation,
                             String location, String notes, Instant at) {
        if (!isOpen()) throw new IllegalStateException("This dispatch has already been returned");
        this.returnedAt = at;
        this.receivedBy = receivedBy;
        this.returnedByName = returnedByName.trim();
        this.returnCondition = condition;
        this.returnedToCorrectLocation = correctLocation;
        this.returnLocation = location == null || location.isBlank() ? null : location.trim();
        this.returnNotes = notes == null || notes.isBlank() ? null : notes.trim();
    }

    public void markOverdueNotified(LocalDate on) {
        this.overdueNotifiedOn = on;
    }

    public UUID getFileId() { return fileId; }
    public UUID getDispatchedBy() { return dispatchedBy; }
    public UUID getAuthorisedBy() { return authorisedBy; }
    public String getDispatchedTo() { return dispatchedTo; }
    public String getDepartment() { return department; }
    public String getReason() { return reason; }
    public Instant getDispatchedAt() { return dispatchedAt; }
    public LocalDate getExpectedReturnOn() { return expectedReturnOn; }
    public UUID getRequestId() { return requestId; }
    public Instant getReturnedAt() { return returnedAt; }
    public UUID getReceivedBy() { return receivedBy; }
    public String getReturnedByName() { return returnedByName; }
    public Condition getReturnCondition() { return returnCondition; }
    public Boolean getReturnedToCorrectLocation() { return returnedToCorrectLocation; }
    public String getReturnLocation() { return returnLocation; }
    public String getReturnNotes() { return returnNotes; }
    public LocalDate getOverdueNotifiedOn() { return overdueNotifiedOn; }
}
