package com.manageedocs.records.service;

import com.manageedocs.audit.service.AuditService;
import com.manageedocs.common.dto.PagedResponse;
import com.manageedocs.exception.ApiException;
import com.manageedocs.identity.repository.UserRepository;
import com.manageedocs.records.dto.RecordsDtos.CreateFileRequest;
import com.manageedocs.records.dto.RecordsDtos.DispatchFileRequest;
import com.manageedocs.records.dto.RecordsDtos.DispatchView;
import com.manageedocs.records.dto.RecordsDtos.FileDetail;
import com.manageedocs.records.dto.RecordsDtos.FileSummary;
import com.manageedocs.records.dto.RecordsDtos.MovementView;
import com.manageedocs.records.dto.RecordsDtos.ReturnFileRequest;
import com.manageedocs.records.dto.RecordsDtos.StatusAction;
import com.manageedocs.records.dto.RecordsDtos.StatusChangeRequest;
import com.manageedocs.records.dto.RecordsDtos.UpdateFileRequest;
import com.manageedocs.records.model.FileDispatch;
import com.manageedocs.records.model.FileMovement;
import com.manageedocs.records.model.FileMovement.Action;
import com.manageedocs.records.model.FileRequest;
import com.manageedocs.records.model.PhysicalFile;
import com.manageedocs.records.model.PhysicalFile.Status;
import com.manageedocs.records.repository.FileDispatchRepository;
import com.manageedocs.records.repository.FileMovementRepository;
import com.manageedocs.records.repository.FileRequestRepository;
import com.manageedocs.records.repository.PhysicalFileRepository;
import com.manageedocs.security.AppUserDetails;
import com.manageedocs.security.Permission;
import com.manageedocs.tenancy.repository.DepartmentRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * The paper-file registry: registering files, lending them out, taking them back, and every other
 * status change. Each change takes a row lock on the file, writes an append-only movement and an
 * audit event, all in one transaction.
 */
@Service
public class RegistryService {

    private static final List<FileRequest.Status> ACTIVE_REQUESTS = List.of(FileRequest.Status.PENDING, FileRequest.Status.APPROVED);

    private final PhysicalFileRepository files;
    private final FileDispatchRepository dispatches;
    private final FileMovementRepository movements;
    private final FileRequestRepository requests;
    private final DepartmentRepository departments;
    private final UserRepository users;
    private final RecordsViews views;
    private final RegistryNotifier notifier;
    private final AuditService audit;
    private final RecordsTime time;

    public RegistryService(PhysicalFileRepository files, FileDispatchRepository dispatches, FileMovementRepository movements,
                           FileRequestRepository requests, DepartmentRepository departments, UserRepository users,
                           RecordsViews views, RegistryNotifier notifier, AuditService audit, RecordsTime time) {
        this.files = files;
        this.dispatches = dispatches;
        this.movements = movements;
        this.requests = requests;
        this.departments = departments;
        this.users = users;
        this.views = views;
        this.notifier = notifier;
        this.audit = audit;
        this.time = time;
    }

    // ── Reading ───────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PagedResponse<FileSummary> list(String q, Status status, UUID departmentId, int page, int size) {
        String like = q == null || q.isBlank() ? null : "%" + q.trim().toLowerCase() + "%";
        PageRequest pr = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100),
                Sort.by("fileNumber").ascending().and(Sort.by("volumeNumber")));
        var result = files.search(like, status, departmentId, pr);
        List<FileSummary> content = views.files(result.getContent());
        return PagedResponse.of(content, result.getNumber(), result.getSize(), result.getTotalElements());
    }

    @Transactional(readOnly = true)
    public FileDetail get(AppUserDetails caller, UUID id) {
        PhysicalFile f = file(id);
        DispatchView open = dispatches.findFirstByFileIdAndReturnedAtIsNull(id).map(d -> views.dispatch(d, f)).orElse(null);
        List<MovementView> history = movements.findByFileIdOrderByOccurredAtDesc(id).stream().map(MovementView::of).toList();
        List<FileRequest> active = requests.findByFileIdAndStatusIn(id, ACTIVE_REQUESTS);
        if (!caller.has(Permission.RECORDS_DISPATCH)) {
            active = active.stream().filter(r -> r.getRequestedBy().equals(caller.userId())).toList();
        }
        return new FileDetail(views.file(f), open, history, views.requests(active), allowedActions(caller, f));
    }

    @Transactional(readOnly = true)
    public List<DispatchView> history(UUID fileId) {
        file(fileId);
        return views.dispatches(dispatches.findByFileIdOrderByDispatchedAtDesc(fileId));
    }

    @Transactional(readOnly = true)
    public List<DispatchView> outstanding(boolean overdueOnly) {
        List<FileDispatch> open = dispatches.findByReturnedAtIsNullOrderByDispatchedAtAsc();
        if (overdueOnly) open = open.stream().filter(d -> d.isOverdue(time.today())).toList();
        return views.dispatches(open);
    }

    // ── Register ──────────────────────────────────────────────────────────

    @Transactional
    public FileSummary create(AppUserDetails caller, CreateFileRequest req) {
        int volume = req.volumeNumber() == null ? 1 : req.volumeNumber();
        String number = req.fileNumber().trim().toUpperCase();
        if (files.existsByFileNumberAndVolumeNumber(number, volume)) {
            throw ApiException.conflict("FILE_NUMBER_TAKEN", "File " + number + " volume " + volume + " is already registered");
        }
        requireDepartment(req.departmentId());
        PhysicalFile f = files.save(new PhysicalFile(number, req.customerName(), req.departmentId(), req.dateOpened(),
                volume, req.homeLocation()));
        move(caller, f, Action.CREATED, null, null, f.getCurrentLocation(), null);
        audit.success(caller, "PHYSICAL_FILE_CREATED", RegistryNotifier.RESOURCE, f.getId(),
                Map.of("fileNumber", f.getFileNumber(), "volume", Integer.toString(volume)));
        return views.file(f);
    }

    @Transactional
    public FileSummary update(AppUserDetails caller, UUID id, UpdateFileRequest req) {
        PhysicalFile f = locked(id);
        requireDepartment(req.departmentId());
        Map<String, String> changes = new LinkedHashMap<>();
        if (req.customerName() != null && !req.customerName().isBlank() && !req.customerName().trim().equals(f.getCustomerName())) {
            changes.put("customerName", f.getCustomerName() + " → " + req.customerName().trim());
        }
        if (!Objects.equals(req.departmentId(), f.getDepartmentId())) changes.put("department", "changed");
        String home = req.homeLocation() == null || req.homeLocation().isBlank() ? null : req.homeLocation().trim();
        if (!Objects.equals(home, f.getHomeLocation())) changes.put("homeLocation", f.getHomeLocation() + " → " + home);
        if (changes.isEmpty()) return views.file(f);
        f.update(req.customerName(), req.departmentId(), req.homeLocation());
        move(caller, f, Action.UPDATED, null, null, null, String.join("; ", changes.keySet()));
        audit.success(caller, "PHYSICAL_FILE_UPDATED", RegistryNotifier.RESOURCE, id, changes);
        return views.file(f);
    }

    // ── Loans ─────────────────────────────────────────────────────────────

    @Transactional
    public DispatchView dispatch(AppUserDetails caller, UUID id, DispatchFileRequest req) {
        PhysicalFile f = locked(id);
        if (f.getStatus() != Status.AVAILABLE) {
            throw ApiException.conflict("FILE_NOT_AVAILABLE", "Only an available file can be dispatched; this one is "
                    + f.getStatus().name().toLowerCase());
        }
        if (req.expectedReturnOn() != null && req.expectedReturnOn().isBefore(time.today())) {
            throw new IllegalArgumentException("The expected return date cannot be in the past");
        }
        if (req.authorisedBy() != null && !users.existsById(req.authorisedBy())) throw ApiException.notFound("Authorising user");
        FileRequest request = null;
        if (req.requestId() != null) {
            request = requests.findById(req.requestId()).filter(r -> r.getFileId().equals(id))
                    .orElseThrow(() -> ApiException.notFound("Request for this file"));
            if (request.getStatus() != FileRequest.Status.APPROVED) {
                throw ApiException.conflict("REQUEST_NOT_APPROVED", "Approve the request before dispatching against it");
            }
        }
        String from = f.getCurrentLocation();
        FileDispatch d = dispatches.save(new FileDispatch(id, caller.userId(), req.authorisedBy(), req.dispatchedTo(),
                req.department(), req.reason(), time.now(), req.expectedReturnOn(), req.requestId()));
        f.moveTo(Status.DISPATCHED, req.department());
        move(caller, f, Action.DISPATCHED, req.department(), from, req.department(), "To " + d.getDispatchedTo()
                + (d.getReason() == null ? "" : ": " + d.getReason()));
        if (request != null) {
            request.fulfil(d.getId());
            notifier.users(List.of(request.getRequestedBy()), "RECORDS_REQUEST_DISPATCHED",
                    "File " + f.getFileNumber() + " is on its way",
                    "Dispatched to " + d.getDispatchedTo() + " (" + d.getDepartment() + ")", id);
        }
        audit.success(caller, "PHYSICAL_FILE_DISPATCHED", RegistryNotifier.RESOURCE, id, Map.of(
                "dispatchId", d.getId().toString(), "to", d.getDispatchedTo(), "department", d.getDepartment(),
                "expectedReturnOn", String.valueOf(d.getExpectedReturnOn())));
        return views.dispatch(d, f);
    }

    @Transactional
    public DispatchView receive(AppUserDetails caller, UUID id, ReturnFileRequest req) {
        PhysicalFile f = locked(id);
        FileDispatch d = dispatches.findFirstByFileIdAndReturnedAtIsNull(id)
                .filter(x -> f.getStatus() == Status.DISPATCHED)
                .orElseThrow(() -> ApiException.conflict("NOT_DISPATCHED", "This file is not out on loan"));
        String location = req.returnedToCorrectLocation()
                ? firstNonBlank(req.location(), f.getHomeLocation(), "Registry")
                : req.location();
        if (!req.returnedToCorrectLocation() && (location == null || location.isBlank())) {
            throw new IllegalArgumentException("Say where the file was actually put back");
        }
        d.recordReturn(caller.userId(), req.returnedByName(), req.condition(), req.returnedToCorrectLocation(),
                location, req.notes(), time.now());
        String from = f.getCurrentLocation();
        f.moveTo(Status.RETURNED, location);
        move(caller, f, Action.RETURNED, d.getDepartment(), from, location,
                "Returned by " + d.getReturnedByName() + ", condition " + req.condition().name().toLowerCase()
                        + (req.notes() == null || req.notes().isBlank() ? "" : ": " + req.notes().trim()));
        if (!req.returnedToCorrectLocation()) {
            notifier.administrators("RECORDS_WRONG_LOCATION", "File " + f.getFileNumber() + " was put back in the wrong place",
                    "Expected " + firstNonBlank(f.getHomeLocation(), "its home shelf", null) + ", found at " + location, id);
        }
        if (req.condition() == FileDispatch.Condition.DAMAGED || req.condition() == FileDispatch.Condition.INCOMPLETE) {
            notifier.administrators("RECORDS_RETURNED_" + req.condition().name(), "File " + f.getFileNumber()
                    + " came back " + req.condition().name().toLowerCase(), "Returned by " + d.getReturnedByName(), id);
        }
        audit.success(caller, "PHYSICAL_FILE_RETURNED", RegistryNotifier.RESOURCE, id, Map.of(
                "dispatchId", d.getId().toString(), "condition", req.condition().name(),
                "correctLocation", Boolean.toString(req.returnedToCorrectLocation()), "location", String.valueOf(location)));
        return views.dispatch(d, f);
    }

    // ── Other status changes ──────────────────────────────────────────────

    @Transactional
    public FileSummary changeStatus(AppUserDetails caller, UUID id, StatusChangeRequest req) {
        PhysicalFile f = locked(id);
        requireMay(caller, req.action(), f);
        String from = f.getCurrentLocation();
        String notes = req.notes();
        switch (req.action()) {
            case SHELVE -> {
                f.moveTo(Status.AVAILABLE, firstNonBlank(req.location(), f.getHomeLocation(), null));
                move(caller, f, Action.RELOCATED, null, from, f.getCurrentLocation(), firstNonBlank(notes, "Back on the shelf", null));
            }
            case RELOCATE -> {
                if (req.location() == null || req.location().isBlank()) throw new IllegalArgumentException("Give the new location");
                if (f.getStatus() != Status.AVAILABLE && f.getStatus() != Status.RETURNED) {
                    throw ApiException.conflict("FILE_NOT_IN_REGISTRY", "Only a file in the registry can be moved");
                }
                f.relocate(req.location());
                move(caller, f, Action.RELOCATED, null, from, f.getCurrentLocation(), notes);
            }
            case ARCHIVE -> {
                closeOpenLoan(caller, f, "Archived while on loan");
                f.moveTo(Status.ARCHIVED, req.location());
                move(caller, f, Action.ARCHIVED, null, from, f.getCurrentLocation(), notes);
            }
            case FLAG_MISSING -> {
                f.moveTo(Status.MISSING, null);
                move(caller, f, Action.FLAGGED_MISSING, null, from, null, notes);
                notifier.administrators("RECORDS_FILE_MISSING", "File " + f.getFileNumber() + " has been reported missing",
                        "Reported by " + caller.fullName() + (notes == null || notes.isBlank() ? "" : ": " + notes.trim()), id);
            }
            case RECOVER -> {
                closeOpenLoan(caller, f, "Recovered after being reported missing");
                f.moveTo(Status.AVAILABLE, firstNonBlank(req.location(), f.getHomeLocation(), null));
                move(caller, f, Action.RECOVERED, null, from, f.getCurrentLocation(), notes);
            }
            case RESTORE -> {
                f.moveTo(Status.AVAILABLE, firstNonBlank(req.location(), f.getHomeLocation(), null));
                move(caller, f, Action.RECOVERED, null, from, f.getCurrentLocation(), firstNonBlank(notes, "Restored from archive", null));
            }
        }
        audit.success(caller, "PHYSICAL_FILE_" + req.action().name(), RegistryNotifier.RESOURCE, id,
                Map.of("status", f.getStatus().name(), "location", String.valueOf(f.getCurrentLocation())));
        return views.file(f);
    }

    /** What this caller may do to this file right now; the UI shows exactly these actions. */
    List<String> allowedActions(AppUserDetails caller, PhysicalFile f) {
        List<String> out = new ArrayList<>();
        Status s = f.getStatus();
        boolean manage = caller.has(Permission.RECORDS_MANAGE);
        boolean dispatch = caller.has(Permission.RECORDS_DISPATCH);
        if (dispatch && s == Status.AVAILABLE) out.add("DISPATCH");
        if (dispatch && s == Status.DISPATCHED) out.add("RETURN");
        if ((dispatch || manage) && s == Status.RETURNED) out.add(StatusAction.SHELVE.name());
        if (manage && (s == Status.AVAILABLE || s == Status.RETURNED)) out.add(StatusAction.RELOCATE.name());
        if (manage && PhysicalFile.canMove(s, Status.ARCHIVED)) out.add(StatusAction.ARCHIVE.name());
        if (manage && PhysicalFile.canMove(s, Status.MISSING)) out.add(StatusAction.FLAG_MISSING.name());
        if (manage && s == Status.MISSING) out.add(StatusAction.RECOVER.name());
        if (manage && caller.isAdmin() && s == Status.ARCHIVED) out.add(StatusAction.RESTORE.name());
        if (manage) out.add("EDIT");
        if (caller.has(Permission.RECORDS_REQUEST) && s != Status.ARCHIVED && s != Status.MISSING) out.add("REQUEST");
        return out;
    }

    private void requireMay(AppUserDetails caller, StatusAction action, PhysicalFile f) {
        boolean ok = switch (action) {
            case SHELVE -> caller.has(Permission.RECORDS_DISPATCH) || caller.has(Permission.RECORDS_MANAGE);
            case RESTORE -> caller.has(Permission.RECORDS_MANAGE) && caller.isAdmin();
            default -> caller.has(Permission.RECORDS_MANAGE);
        };
        if (!ok) {
            throw ApiException.forbidden(action == StatusAction.RESTORE
                    ? "Only an administrator can restore an archived file"
                    : "You are not allowed to change this file's status").deniedOn(RegistryNotifier.RESOURCE, f.getId());
        }
    }

    /** A lost or archived file cannot stay "on loan" for ever: close its open loan with an explanation. */
    private void closeOpenLoan(AppUserDetails caller, PhysicalFile f, String why) {
        dispatches.findFirstByFileIdAndReturnedAtIsNull(f.getId()).ifPresent(d ->
                d.recordReturn(caller.userId(), "Not returned", null, false, null, why, time.now()));
    }

    private void move(AppUserDetails caller, PhysicalFile f, Action action, String department, String from, String to,
                      String notes) {
        movements.save(new FileMovement(f.getId(), action, caller.userId(), department, from, to, notes, time.now()));
    }

    private PhysicalFile file(UUID id) {
        return files.findById(id).orElseThrow(() -> ApiException.notFound("File"));
    }

    private PhysicalFile locked(UUID id) {
        return files.lockById(id).orElseThrow(() -> ApiException.notFound("File"));
    }

    private void requireDepartment(UUID departmentId) {
        if (departmentId != null && !departments.existsById(departmentId)) throw ApiException.notFound("Department");
    }

    private static String firstNonBlank(String a, String b, String c) {
        if (a != null && !a.isBlank()) return a.trim();
        if (b != null && !b.isBlank()) return b.trim();
        return c;
    }
}
