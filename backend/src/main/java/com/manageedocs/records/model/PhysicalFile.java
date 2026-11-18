package com.manageedocs.records.model;

import com.manageedocs.common.persistence.TenantScopedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * A paper file jacket held by the registry. Its status only changes through {@link #moveTo}, which
 * enforces the lifecycle ported from the legacy system:
 * AVAILABLE → DISPATCHED | ARCHIVED | MISSING; DISPATCHED → RETURNED | MISSING;
 * RETURNED → AVAILABLE | ARCHIVED; ARCHIVED → AVAILABLE; MISSING → AVAILABLE | ARCHIVED.
 */
@Entity
@Table(name = "physical_file")
public class PhysicalFile extends TenantScopedEntity {

    public enum Status { AVAILABLE, DISPATCHED, RETURNED, ARCHIVED, MISSING }

    private static final Map<Status, Set<Status>> ALLOWED = Map.of(
            Status.AVAILABLE, EnumSet.of(Status.DISPATCHED, Status.ARCHIVED, Status.MISSING),
            Status.DISPATCHED, EnumSet.of(Status.RETURNED, Status.MISSING),
            Status.RETURNED, EnumSet.of(Status.AVAILABLE, Status.ARCHIVED),
            Status.ARCHIVED, EnumSet.of(Status.AVAILABLE),
            Status.MISSING, EnumSet.of(Status.AVAILABLE, Status.ARCHIVED));

    @Column(name = "file_number", nullable = false, length = 64)
    private String fileNumber;

    @Column(name = "customer_name", nullable = false, length = 200)
    private String customerName;

    @Column(name = "department_id")
    private UUID departmentId;

    @Column(name = "date_opened", nullable = false)
    private LocalDate dateOpened;

    @Column(name = "volume_number", nullable = false)
    private int volumeNumber;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status = Status.AVAILABLE;

    @Column(name = "current_location", length = 200)
    private String currentLocation;

    @Column(name = "home_location", length = 200)
    private String homeLocation;

    protected PhysicalFile() {
    }

    public PhysicalFile(String fileNumber, String customerName, UUID departmentId, LocalDate dateOpened,
                        int volumeNumber, String homeLocation) {
        this.fileNumber = fileNumber.trim().toUpperCase();
        this.customerName = customerName.trim();
        this.departmentId = departmentId;
        this.dateOpened = dateOpened;
        this.volumeNumber = volumeNumber;
        this.homeLocation = blankToNull(homeLocation);
        this.currentLocation = this.homeLocation;
    }

    public static boolean canMove(Status from, Status to) {
        return ALLOWED.getOrDefault(from, Set.of()).contains(to);
    }

    /** Changes status (and optionally location). Throws if the lifecycle does not allow the move. */
    public void moveTo(Status next, String location) {
        if (!canMove(status, next)) {
            throw new IllegalStateException("A file that is " + status.name().toLowerCase()
                    + " cannot become " + next.name().toLowerCase());
        }
        this.status = next;
        if (location != null && !location.isBlank()) this.currentLocation = location.trim();
    }

    public void relocate(String location) {
        this.currentLocation = location.trim();
    }

    public void update(String customerName, UUID departmentId, String homeLocation) {
        if (customerName != null && !customerName.isBlank()) this.customerName = customerName.trim();
        this.departmentId = departmentId;
        this.homeLocation = blankToNull(homeLocation);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    public String getFileNumber() { return fileNumber; }
    public String getCustomerName() { return customerName; }
    public UUID getDepartmentId() { return departmentId; }
    public LocalDate getDateOpened() { return dateOpened; }
    public int getVolumeNumber() { return volumeNumber; }
    public Status getStatus() { return status; }
    public String getCurrentLocation() { return currentLocation; }
    public String getHomeLocation() { return homeLocation; }
}
