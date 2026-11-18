package com.manageedocs.dashboard.dto;

import java.util.Map;

public final class DashboardDtos {

    private DashboardDtos() {
    }

    /** Each section is null when the caller lacks the capability behind it. */
    public record Dashboard(DocumentMetrics documents, RecordsMetrics records, Long openTasks, long unreadNotifications) {
    }

    /** Counts of documents this caller can see (same permission filter as search). */
    public record DocumentMetrics(long visible, Map<String, Long> byStatus) {
    }

    public record RecordsMetrics(long totalFiles, Map<String, Long> byStatus, long outOnLoan, long overdue,
                                 long dispatchedToday, long returnedToday, long pendingRequests) {
    }
}
