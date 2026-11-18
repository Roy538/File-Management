package com.manageedocs.records.service;

import com.manageedocs.audit.service.AuditService;
import com.manageedocs.common.dto.PagedResponse;
import com.manageedocs.exception.ApiException;
import com.manageedocs.records.dto.RecordsDtos.CreateFileRequestRequest;
import com.manageedocs.records.dto.RecordsDtos.RequestView;
import com.manageedocs.records.model.FileRequest;
import com.manageedocs.records.model.PhysicalFile;
import com.manageedocs.records.repository.FileRequestRepository;
import com.manageedocs.records.repository.PhysicalFileRepository;
import com.manageedocs.security.AppUserDetails;
import com.manageedocs.security.Permission;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Requests to borrow a file. Registry staff (RECORDS_DISPATCH) see and decide every request;
 * everyone else sees and cancels only their own. The submitter of a request is never the one who
 * approves it.
 */
@Service
public class FileRequestService {

    private final FileRequestRepository requests;
    private final PhysicalFileRepository files;
    private final RecordsViews views;
    private final RegistryNotifier notifier;
    private final AuditService audit;
    private final RecordsTime time;

    public FileRequestService(FileRequestRepository requests, PhysicalFileRepository files, RecordsViews views,
                              RegistryNotifier notifier, AuditService audit, RecordsTime time) {
        this.requests = requests;
        this.files = files;
        this.views = views;
        this.notifier = notifier;
        this.audit = audit;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public PagedResponse<RequestView> list(AppUserDetails caller, FileRequest.Status status, boolean mine, int page, int size) {
        UUID only = mine || !caller.has(Permission.RECORDS_DISPATCH) ? caller.userId() : null;
        var result = requests.search(status, only, PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100)));
        return PagedResponse.of(views.requests(result.getContent()), result.getNumber(), result.getSize(), result.getTotalElements());
    }

    @Transactional
    public RequestView create(AppUserDetails caller, CreateFileRequestRequest req) {
        PhysicalFile f = files.findById(req.fileId()).orElseThrow(() -> ApiException.notFound("File"));
        if (f.getStatus() == PhysicalFile.Status.ARCHIVED || f.getStatus() == PhysicalFile.Status.MISSING) {
            throw ApiException.conflict("FILE_UNAVAILABLE", "This file is " + f.getStatus().name().toLowerCase()
                    + " and cannot be requested");
        }
        if (req.neededBy() != null && req.neededBy().isBefore(time.today())) {
            throw new IllegalArgumentException("The needed-by date cannot be in the past");
        }
        boolean duplicate = requests.findByFileIdAndStatusIn(f.getId(), List.of(FileRequest.Status.PENDING, FileRequest.Status.APPROVED))
                .stream().anyMatch(r -> r.getRequestedBy().equals(caller.userId()));
        if (duplicate) throw ApiException.conflict("ALREADY_REQUESTED", "You already have an open request for this file");

        FileRequest r = requests.save(new FileRequest(f.getId(), caller.userId(), req.department(), req.purpose(), req.neededBy()));
        boolean out = f.getStatus() == PhysicalFile.Status.DISPATCHED;
        notifier.registryStaff(caller.userId(), out ? "RECORDS_REQUEST_FILE_OUT" : "RECORDS_REQUEST_CREATED",
                "File " + f.getFileNumber() + " requested by " + caller.fullName(),
                (out ? "The file is currently out on loan. " : "") + "For " + r.getDepartment()
                        + (r.getPurpose() == null ? "" : ": " + r.getPurpose()), f.getId());
        audit.success(caller, "FILE_REQUEST_CREATED", "FILE_REQUEST", r.getId(),
                Map.of("fileId", f.getId().toString(), "fileOut", Boolean.toString(out)));
        return views.request(r, f);
    }

    @Transactional
    public RequestView decide(AppUserDetails caller, UUID id, boolean approve, String notes) {
        FileRequest r = request(caller, id);
        if (r.getRequestedBy().equals(caller.userId())) {
            throw ApiException.forbidden("You cannot decide your own request").deniedOn("FILE_REQUEST", id);
        }
        if (!approve && (notes == null || notes.isBlank())) throw new IllegalArgumentException("Give a reason for rejecting");
        r.decide(approve, caller.userId(), notes, time.now());
        PhysicalFile f = files.findById(r.getFileId()).orElseThrow();
        notifier.users(List.of(r.getRequestedBy()), approve ? "RECORDS_REQUEST_APPROVED" : "RECORDS_REQUEST_REJECTED",
                "Your request for file " + f.getFileNumber() + " was " + (approve ? "approved" : "rejected"),
                r.getDecisionNotes(), f.getId());
        audit.success(caller, approve ? "FILE_REQUEST_APPROVED" : "FILE_REQUEST_REJECTED", "FILE_REQUEST", id,
                Map.of("notes", String.valueOf(r.getDecisionNotes())));
        return views.request(r, f);
    }

    @Transactional
    public RequestView cancel(AppUserDetails caller, UUID id) {
        FileRequest r = request(caller, id);
        if (!r.getRequestedBy().equals(caller.userId()) && !caller.has(Permission.RECORDS_DISPATCH)) {
            throw ApiException.forbidden("Only the requester or registry staff can cancel a request").deniedOn("FILE_REQUEST", id);
        }
        r.cancel();
        audit.success(caller, "FILE_REQUEST_CANCELLED", "FILE_REQUEST", id, Map.of());
        return views.request(r, files.findById(r.getFileId()).orElseThrow());
    }

    /** Someone else's request is "not found" to people who may only see their own. */
    private FileRequest request(AppUserDetails caller, UUID id) {
        return requests.findById(id)
                .filter(r -> caller.has(Permission.RECORDS_DISPATCH) || r.getRequestedBy().equals(caller.userId()))
                .orElseThrow(() -> ApiException.notFound("Request"));
    }
}
