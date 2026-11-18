package com.manageedocs.records.service;

import com.manageedocs.records.dto.RecordsDtos.DispatchView;
import com.manageedocs.records.dto.RecordsDtos.FileSummary;
import com.manageedocs.records.dto.RecordsDtos.RequestView;
import com.manageedocs.records.model.FileDispatch;
import com.manageedocs.records.model.FileRequest;
import com.manageedocs.records.model.PhysicalFile;
import com.manageedocs.records.repository.PhysicalFileRepository;
import com.manageedocs.tenancy.repository.DepartmentRepository;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Builds API views in batches (one query per related table, never one per row). */
@Component
public class RecordsViews {

    private final PhysicalFileRepository files;
    private final DepartmentRepository departments;
    private final RecordsTime time;

    public RecordsViews(PhysicalFileRepository files, DepartmentRepository departments, RecordsTime time) {
        this.files = files;
        this.departments = departments;
        this.time = time;
    }

    public List<FileSummary> files(Collection<PhysicalFile> list) {
        Map<UUID, String> names = departmentNames(list.stream().map(PhysicalFile::getDepartmentId).toList());
        return list.stream().map(f -> summary(f, names)).toList();
    }

    public FileSummary file(PhysicalFile f) {
        return files(List.of(f)).getFirst();
    }

    public List<DispatchView> dispatches(Collection<FileDispatch> list) {
        Map<UUID, PhysicalFile> byId = filesById(list.stream().map(FileDispatch::getFileId).toList());
        return list.stream().map(d -> dispatch(d, byId.get(d.getFileId()))).toList();
    }

    public DispatchView dispatch(FileDispatch d, PhysicalFile f) {
        return new DispatchView(d.getId(), d.getFileId(), f == null ? null : f.getFileNumber(),
                f == null ? null : f.getCustomerName(), d.getDispatchedTo(), d.getDepartment(), d.getReason(),
                d.getDispatchedBy(), d.getAuthorisedBy(), d.getDispatchedAt(), d.getExpectedReturnOn(),
                d.isOverdue(time.today()), d.getRequestId(), d.getReturnedAt(), d.getReceivedBy(),
                d.getReturnedByName(), d.getReturnCondition(), d.getReturnedToCorrectLocation(),
                d.getReturnLocation(), d.getReturnNotes());
    }

    public List<RequestView> requests(Collection<FileRequest> list) {
        Map<UUID, PhysicalFile> byId = filesById(list.stream().map(FileRequest::getFileId).toList());
        return list.stream().map(r -> request(r, byId.get(r.getFileId()))).toList();
    }

    public RequestView request(FileRequest r, PhysicalFile f) {
        return new RequestView(r.getId(), r.getFileId(), f == null ? null : f.getFileNumber(),
                f == null ? null : f.getCustomerName(), f == null ? null : f.getStatus(), r.getRequestedBy(),
                r.getDepartment(), r.getPurpose(), r.getNeededBy(), r.getStatus(), r.getDecidedBy(),
                r.getDecidedAt(), r.getDecisionNotes(), r.getDispatchId(), r.getCreatedAt());
    }

    /** A HashMap on purpose: callers look up files with no department (null key), which Map.of() rejects. */
    public Map<UUID, String> departmentNames(Collection<UUID> ids) {
        Map<UUID, String> names = new HashMap<>();
        List<UUID> wanted = ids.stream().filter(Objects::nonNull).distinct().toList();
        if (!wanted.isEmpty()) departments.findAllById(wanted).forEach(d -> names.put(d.getId(), d.getName()));
        return names;
    }

    public Map<UUID, PhysicalFile> filesById(Collection<UUID> ids) {
        return files.findAllById(ids.stream().distinct().toList()).stream()
                .collect(Collectors.toMap(PhysicalFile::getId, Function.identity()));
    }

    private static FileSummary summary(PhysicalFile f, Map<UUID, String> departmentNames) {
        return new FileSummary(f.getId(), f.getFileNumber(), f.getVolumeNumber(), f.getCustomerName(),
                f.getDepartmentId(), departmentNames.get(f.getDepartmentId()), f.getDateOpened(), f.getStatus(),
                f.getCurrentLocation(), f.getHomeLocation(), f.getUpdatedAt());
    }
}
