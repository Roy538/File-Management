package com.manageedocs.records.model;

import com.manageedocs.common.persistence.Ids;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/** Append-only history of a physical file. Rows are never updated or deleted. */
@Entity
@Immutable
@Table(name = "file_movement")
public class FileMovement {

    public enum Action { CREATED, DISPATCHED, RETURNED, RELOCATED, ARCHIVED, FLAGGED_MISSING, RECOVERED, UPDATED }

    @Id
    private UUID id = Ids.newId();

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "file_id", nullable = false)
    private UUID fileId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Action action;

    @Column(name = "performed_by")
    private UUID performedBy;

    @Column(length = 200)
    private String department;

    @Column(name = "from_location", length = 200)
    private String fromLocation;

    @Column(name = "to_location", length = 200)
    private String toLocation;

    @Column(length = 1000)
    private String notes;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    protected FileMovement() {
    }

    public FileMovement(UUID fileId, Action action, UUID performedBy, String department, String fromLocation,
                        String toLocation, String notes, Instant occurredAt) {
        this.fileId = fileId;
        this.action = action;
        this.performedBy = performedBy;
        this.department = department;
        this.fromLocation = fromLocation;
        this.toLocation = toLocation;
        this.notes = notes == null || notes.isBlank() ? null : notes.trim();
        this.occurredAt = occurredAt;
    }

    public UUID getId() { return id; }
    public UUID getFileId() { return fileId; }
    public Action getAction() { return action; }
    public UUID getPerformedBy() { return performedBy; }
    public String getDepartment() { return department; }
    public String getFromLocation() { return fromLocation; }
    public String getToLocation() { return toLocation; }
    public String getNotes() { return notes; }
    public Instant getOccurredAt() { return occurredAt; }
}
