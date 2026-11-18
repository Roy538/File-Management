package com.manageedocs.dashboard.service;

import com.manageedocs.dashboard.dto.DashboardDtos.Dashboard;
import com.manageedocs.dashboard.dto.DashboardDtos.DocumentMetrics;
import com.manageedocs.dashboard.dto.DashboardDtos.RecordsMetrics;
import com.manageedocs.notifications.service.NotificationService;
import com.manageedocs.records.model.FileRequest;
import com.manageedocs.records.model.PhysicalFile;
import com.manageedocs.records.repository.FileDispatchRepository;
import com.manageedocs.records.repository.FileRequestRepository;
import com.manageedocs.records.repository.PhysicalFileRepository;
import com.manageedocs.records.service.RecordsTime;
import com.manageedocs.search.dto.SearchDtos.FacetValue;
import com.manageedocs.search.dto.SearchDtos.SearchQuery;
import com.manageedocs.search.dto.SearchDtos.SearchResult;
import com.manageedocs.search.service.SearchService;
import com.manageedocs.security.AppUserDetails;
import com.manageedocs.security.Permission;
import com.manageedocs.workflows.service.WorkflowEngine;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Home-page figures. Document counts reuse the search permission filter, so nobody learns how many
 * documents exist in cabinets they cannot open. Registry figures need RECORDS_VIEW.
 */
@Service
public class DashboardService {

    private final SearchService search;
    private final WorkflowEngine workflows;
    private final NotificationService notifications;
    private final PhysicalFileRepository files;
    private final FileDispatchRepository dispatches;
    private final FileRequestRepository requests;
    private final RecordsTime time;

    public DashboardService(SearchService search, WorkflowEngine workflows, NotificationService notifications,
                            PhysicalFileRepository files, FileDispatchRepository dispatches, FileRequestRepository requests,
                            RecordsTime time) {
        this.search = search;
        this.workflows = workflows;
        this.notifications = notifications;
        this.files = files;
        this.dispatches = dispatches;
        this.requests = requests;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public Dashboard forCaller(AppUserDetails caller) {
        DocumentMetrics docs = null;
        if (caller.has(Permission.DOCUMENTS_VIEW)) {
            SearchResult r = search.search(caller, new SearchQuery(null, null, null, null, null, null, null, null, 0, 1));
            Map<String, Long> byStatus = new LinkedHashMap<>();
            for (FacetValue v : r.facets().getOrDefault("status", List.of())) byStatus.put(v.value(), v.count());
            docs = new DocumentMetrics(r.results().totalElements(), byStatus);
        }
        Long tasks = caller.has(Permission.WORKFLOWS_PARTICIPATE) ? (long) workflows.myTasks(caller).size() : null;
        return new Dashboard(docs, caller.has(Permission.RECORDS_VIEW) ? records(caller) : null, tasks,
                notifications.unreadCount(caller));
    }

    private RecordsMetrics records(AppUserDetails caller) {
        Map<String, Long> byStatus = new LinkedHashMap<>();
        for (PhysicalFile.Status s : PhysicalFile.Status.values()) byStatus.put(s.name(), 0L);
        long total = 0;
        for (Object[] row : files.countByStatus()) {
            long n = (Long) row[1];
            byStatus.put(((PhysicalFile.Status) row[0]).name(), n);
            total += n;
        }
        LocalDate today = time.today();
        var from = time.startOf(today);
        var to = time.startOf(today.plusDays(1));
        long pending = caller.has(Permission.RECORDS_DISPATCH)
                ? requests.countByStatus(FileRequest.Status.PENDING)
                : requests.search(FileRequest.Status.PENDING, caller.userId(), PageRequest.of(0, 1)).getTotalElements();
        return new RecordsMetrics(total, byStatus, dispatches.countByReturnedAtIsNull(), dispatches.countOverdue(today),
                dispatches.countByDispatchedAtGreaterThanEqualAndDispatchedAtLessThan(from, to),
                dispatches.countByReturnedAtGreaterThanEqualAndReturnedAtLessThan(from, to), pending);
    }
}
