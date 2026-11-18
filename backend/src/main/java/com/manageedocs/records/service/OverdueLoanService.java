package com.manageedocs.records.service;

import com.manageedocs.records.model.FileDispatch;
import com.manageedocs.records.model.PhysicalFile;
import com.manageedocs.records.repository.FileDispatchRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Daily reminder for files kept past their expected return date. The person who dispatched the file
 * is told once per day per loan ({@code overdue_notified_on}), so reruns the same day are harmless.
 */
@Service
public class OverdueLoanService {

    private final FileDispatchRepository dispatches;
    private final RecordsViews views;
    private final RegistryNotifier notifier;
    private final RecordsTime time;

    public OverdueLoanService(FileDispatchRepository dispatches, RecordsViews views, RegistryNotifier notifier,
                              RecordsTime time) {
        this.dispatches = dispatches;
        this.views = views;
        this.notifier = notifier;
        this.time = time;
    }

    /** For the current organisation. Returns how many reminders were sent. */
    @Transactional
    public int notifyOverdue() {
        LocalDate today = time.today();
        List<FileDispatch> due = dispatches.findOverdueToNotify(today);
        if (due.isEmpty()) return 0;
        Map<UUID, PhysicalFile> byId = views.filesById(due.stream().map(FileDispatch::getFileId).toList());
        for (FileDispatch d : due) {
            PhysicalFile f = byId.get(d.getFileId());
            long days = ChronoUnit.DAYS.between(d.getExpectedReturnOn(), today);
            notifier.users(List.of(d.getDispatchedBy()), "RECORDS_FILE_OVERDUE",
                    "File " + f.getFileNumber() + " is " + days + (days == 1 ? " day" : " days") + " overdue",
                    "With " + d.getDispatchedTo() + " (" + d.getDepartment() + "), due back " + d.getExpectedReturnOn(),
                    f.getId());
            d.markOverdueNotified(today);
        }
        return due.size();
    }
}
