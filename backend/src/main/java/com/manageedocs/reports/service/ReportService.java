package com.manageedocs.reports.service;

import com.manageedocs.audit.service.AuditService;
import com.manageedocs.exception.ApiException;
import com.manageedocs.identity.model.User;
import com.manageedocs.identity.repository.UserRepository;
import com.manageedocs.records.model.FileDispatch;
import com.manageedocs.records.model.FileMovement;
import com.manageedocs.records.model.PhysicalFile;
import com.manageedocs.records.repository.FileDispatchRepository;
import com.manageedocs.records.repository.FileMovementRepository;
import com.manageedocs.records.repository.PhysicalFileRepository;
import com.manageedocs.records.service.RecordsTime;
import com.manageedocs.reports.dto.ReportDtos.Column;
import com.manageedocs.reports.dto.ReportDtos.Format;
import com.manageedocs.reports.dto.ReportDtos.ReportFile;
import com.manageedocs.reports.dto.ReportDtos.ReportParams;
import com.manageedocs.reports.dto.ReportDtos.ReportTable;
import com.manageedocs.reports.dto.ReportDtos.ReportType;
import com.manageedocs.security.AppUserDetails;
import com.manageedocs.tenancy.model.Department;
import com.manageedocs.tenancy.repository.DepartmentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static com.manageedocs.reports.dto.ReportDtos.Column.number;
import static com.manageedocs.reports.dto.ReportDtos.Column.text;

/**
 * Registry reports. Every report is built once as a {@link ReportTable} of display strings and then
 * rendered, so the screen, CSV, Excel and PDF versions always show the same figures. Exports are
 * audited because they take customer data out of the system.
 */
@Service
public class ReportService {

    /** Guards memory and PDF size; a registry report larger than this should be filtered first. */
    static final int MAX_ROWS = 20_000;
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter DAY_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");

    private final PhysicalFileRepository files;
    private final FileDispatchRepository dispatches;
    private final FileMovementRepository movements;
    private final DepartmentRepository departments;
    private final UserRepository users;
    private final ReportRenderer renderer;
    private final AuditService audit;
    private final RecordsTime time;

    public ReportService(PhysicalFileRepository files, FileDispatchRepository dispatches, FileMovementRepository movements,
                         DepartmentRepository departments, UserRepository users, ReportRenderer renderer,
                         AuditService audit, RecordsTime time) {
        this.files = files;
        this.dispatches = dispatches;
        this.movements = movements;
        this.departments = departments;
        this.users = users;
        this.renderer = renderer;
        this.audit = audit;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public ReportTable table(AppUserDetails caller, ReportType type, ReportParams p) {
        return switch (type) {
            case OUTSTANDING -> outstanding(caller);
            case DAILY_DISPATCHES -> dailyDispatches(caller, p.date() == null ? time.today() : p.date());
            case DAILY_RETURNS -> dailyReturns(caller, p.date() == null ? time.today() : p.date());
            case MISSING -> missing(caller);
            case BY_DEPARTMENT -> byDepartment(caller);
            case MONTHLY -> monthly(caller, p.year(), p.month());
            case MOVEMENT_HISTORY -> movementHistory(caller, p.fileId(), p.from(), p.to());
        };
    }

    /** Builds and renders in one transaction, and records who exported what. */
    @Transactional
    public ReportFile export(AppUserDetails caller, ReportType type, ReportParams p, Format format) {
        ReportTable t = table(caller, type, p);
        ReportFile file = renderer.render(t, format, fileStem(t, p));
        audit.success(caller, "REPORT_EXPORTED", "REPORT", type.slug(), Map.of(
                "format", format.name(), "rows", Integer.toString(t.rows().size()), "subtitle", t.subtitle()));
        return file;
    }

    // ── Reports ───────────────────────────────────────────────────────────

    private ReportTable outstanding(AppUserDetails caller) {
        LocalDate today = time.today();
        List<FileDispatch> open = cap(dispatches.findByReturnedAtIsNullOrderByDispatchedAtAsc());
        Map<UUID, PhysicalFile> byId = filesById(open.stream().map(FileDispatch::getFileId).toList());
        Map<UUID, String> names = names(open.stream().map(FileDispatch::getDispatchedBy).toList());
        List<List<String>> rows = new ArrayList<>();
        long overdue = 0;
        for (FileDispatch d : open) {
            PhysicalFile f = byId.get(d.getFileId());
            boolean late = d.isOverdue(today);
            if (late) overdue++;
            rows.add(List.of(f.getFileNumber(), Integer.toString(f.getVolumeNumber()), f.getCustomerName(), d.getDispatchedTo(),
                    d.getDepartment(), dayTime(d.getDispatchedAt()), d.getExpectedReturnOn() == null ? "" : DAY.format(d.getExpectedReturnOn()),
                    Long.toString(ChronoUnit.DAYS.between(time.dayOf(d.getDispatchedAt()), today)),
                    late ? "Overdue" : "On loan", names.getOrDefault(d.getDispatchedBy(), "")));
        }
        return table(ReportType.OUTSTANDING, "As at " + DAY.format(today) + " · " + open.size() + " out, " + overdue + " overdue",
                List.of(text("File no."), number("Vol."), text("Customer"), text("With"), text("Department"), text("Dispatched"),
                        text("Due back"), number("Days out"), text("State"), text("Dispatched by")),
                rows, null, caller);
    }

    private ReportTable dailyDispatches(AppUserDetails caller, LocalDate day) {
        List<FileDispatch> list = cap(dispatches.findByDispatchedAtGreaterThanEqualAndDispatchedAtLessThanOrderByDispatchedAtAsc(
                time.startOf(day), time.startOf(day.plusDays(1))));
        Map<UUID, PhysicalFile> byId = filesById(list.stream().map(FileDispatch::getFileId).toList());
        Map<UUID, String> names = names(list.stream().map(FileDispatch::getDispatchedBy).toList());
        List<List<String>> rows = list.stream().map(d -> {
            PhysicalFile f = byId.get(d.getFileId());
            return List.of(clock(d.getDispatchedAt()), f.getFileNumber(), f.getCustomerName(), d.getDispatchedTo(),
                    d.getDepartment(), nz(d.getReason()), d.getExpectedReturnOn() == null ? "" : DAY.format(d.getExpectedReturnOn()),
                    names.getOrDefault(d.getDispatchedBy(), ""), d.isOpen() ? "Out" : "Returned");
        }).toList();
        return table(ReportType.DAILY_DISPATCHES, DAY.format(day) + " · " + rows.size() + " dispatched",
                List.of(text("Time"), text("File no."), text("Customer"), text("Dispatched to"), text("Department"),
                        text("Reason"), text("Due back"), text("Dispatched by"), text("Now")), rows, null, caller);
    }

    private ReportTable dailyReturns(AppUserDetails caller, LocalDate day) {
        List<FileDispatch> list = cap(dispatches.findByReturnedAtGreaterThanEqualAndReturnedAtLessThanOrderByReturnedAtAsc(
                time.startOf(day), time.startOf(day.plusDays(1))));
        Map<UUID, PhysicalFile> byId = filesById(list.stream().map(FileDispatch::getFileId).toList());
        Map<UUID, String> names = names(list.stream().map(FileDispatch::getReceivedBy).toList());
        long wrong = list.stream().filter(d -> Boolean.FALSE.equals(d.getReturnedToCorrectLocation())).count();
        List<List<String>> rows = list.stream().map(d -> {
            PhysicalFile f = byId.get(d.getFileId());
            return List.of(clock(d.getReturnedAt()), f.getFileNumber(), f.getCustomerName(), nz(d.getReturnedByName()),
                    names.getOrDefault(d.getReceivedBy(), ""), d.getReturnCondition() == null ? "" : sentence(d.getReturnCondition().name()),
                    d.getReturnedToCorrectLocation() == null ? "" : d.getReturnedToCorrectLocation() ? "Yes" : "No",
                    nz(d.getReturnLocation()), nz(d.getReturnNotes()));
        }).toList();
        return table(ReportType.DAILY_RETURNS, DAY.format(day) + " · " + rows.size() + " returned, " + wrong + " to the wrong place",
                List.of(text("Time"), text("File no."), text("Customer"), text("Returned by"), text("Received by"),
                        text("Condition"), text("Right place"), text("Put back at"), text("Notes")), rows, null, caller);
    }

    private ReportTable missing(AppUserDetails caller) {
        LocalDate today = time.today();
        List<PhysicalFile> list = cap(files.findByStatusOrderByFileNumberAsc(PhysicalFile.Status.MISSING));
        Map<UUID, String> depts = departmentNames();
        List<List<String>> rows = list.stream().map(f -> {
            FileMovement flagged = movements.findFirstByFileIdAndActionOrderByOccurredAtDesc(f.getId(), FileMovement.Action.FLAGGED_MISSING);
            LocalDate since = flagged == null ? null : time.dayOf(flagged.getOccurredAt());
            return List.of(f.getFileNumber(), Integer.toString(f.getVolumeNumber()), f.getCustomerName(),
                    depts.getOrDefault(f.getDepartmentId(), ""), nz(flagged == null ? null : flagged.getFromLocation()),
                    since == null ? "" : DAY.format(since), since == null ? "" : Long.toString(ChronoUnit.DAYS.between(since, today)),
                    nz(flagged == null ? null : flagged.getNotes()));
        }).toList();
        return table(ReportType.MISSING, "As at " + DAY.format(today) + " · " + rows.size() + " missing",
                List.of(text("File no."), number("Vol."), text("Customer"), text("Department"), text("Last known location"),
                        text("Reported"), number("Days missing"), text("Notes")), rows, null, caller);
    }

    private ReportTable byDepartment(AppUserDetails caller) {
        Map<UUID, String> depts = departmentNames();
        Map<UUID, EnumMap<PhysicalFile.Status, Long>> counts = new LinkedHashMap<>();
        for (Object[] row : files.countByDepartmentAndStatus()) {
            counts.computeIfAbsent((UUID) row[0], k -> new EnumMap<>(PhysicalFile.Status.class))
                    .merge((PhysicalFile.Status) row[1], (Long) row[2], Long::sum);
        }
        PhysicalFile.Status[] statuses = PhysicalFile.Status.values();
        long[] sums = new long[statuses.length + 1];
        List<List<String>> rows = counts.entrySet().stream()
                .sorted(Map.Entry.comparingByKey(java.util.Comparator.comparing(
                        (UUID id) -> id == null ? "￿" : depts.getOrDefault(id, "")))) // "No department" last
                .map(e -> {
                    List<String> r = new ArrayList<>();
                    r.add(e.getKey() == null ? "No department" : depts.getOrDefault(e.getKey(), "Unknown"));
                    long total = 0;
                    for (int i = 0; i < statuses.length; i++) {
                        long n = e.getValue().getOrDefault(statuses[i], 0L);
                        total += n;
                        sums[i + 1] += n;
                        r.add(Long.toString(n));
                    }
                    sums[0] += total;
                    r.add(1, Long.toString(total));
                    return List.copyOf(r);
                }).toList();
        List<String> totals = new ArrayList<>(List.of("All departments", Long.toString(sums[0])));
        for (int i = 0; i < statuses.length; i++) totals.add(Long.toString(sums[i + 1]));
        List<Column> cols = new ArrayList<>(List.of(text("Department"), number("Total")));
        for (PhysicalFile.Status s : statuses) cols.add(number(sentence(s.name())));
        return table(ReportType.BY_DEPARTMENT, "As at " + DAY.format(time.today()) + " · " + sums[0] + " files",
                cols, rows, totals, caller);
    }

    private ReportTable monthly(AppUserDetails caller, Integer year, Integer month) {
        YearMonth ym = year == null || month == null ? YearMonth.from(time.today()) : yearMonth(year, month);
        Instant from = time.startOf(ym.atDay(1));
        Instant to = time.startOf(ym.plusMonths(1).atDay(1));
        Map<LocalDate, Long> out = dispatches.findByDispatchedAtGreaterThanEqualAndDispatchedAtLessThanOrderByDispatchedAtAsc(from, to)
                .stream().collect(Collectors.groupingBy(d -> time.dayOf(d.getDispatchedAt()), Collectors.counting()));
        Map<LocalDate, Long> back = dispatches.findByReturnedAtGreaterThanEqualAndReturnedAtLessThanOrderByReturnedAtAsc(from, to)
                .stream().collect(Collectors.groupingBy(d -> time.dayOf(d.getReturnedAt()), Collectors.counting()));
        long totalOut = 0, totalBack = 0;
        List<List<String>> rows = new ArrayList<>();
        for (int day = 1; day <= ym.lengthOfMonth(); day++) {
            LocalDate d = ym.atDay(day);
            long o = out.getOrDefault(d, 0L), b = back.getOrDefault(d, 0L);
            totalOut += o;
            totalBack += b;
            rows.add(List.of(DAY.format(d), d.getDayOfWeek().getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.ENGLISH),
                    Long.toString(o), Long.toString(b), Long.toString(o - b)));
        }
        String label = ym.getMonth().getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.ENGLISH) + " " + ym.getYear();
        return table(ReportType.MONTHLY, label + " · " + totalOut + " dispatched, " + totalBack + " returned",
                List.of(text("Date"), text("Day"), number("Dispatched"), number("Returned"), number("Net out")),
                rows, List.of("Total", "", Long.toString(totalOut), Long.toString(totalBack), Long.toString(totalOut - totalBack)), caller);
    }

    private ReportTable movementHistory(AppUserDetails caller, UUID fileId, LocalDate fromDay, LocalDate toDay) {
        if (fileId == null) throw new IllegalArgumentException("Choose a file");
        PhysicalFile f = files.findById(fileId).orElseThrow(() -> ApiException.notFound("File"));
        LocalDate start = fromDay == null ? f.getDateOpened().minusYears(100) : fromDay;
        LocalDate end = toDay == null ? time.today() : toDay;
        if (end.isBefore(start)) throw new IllegalArgumentException("The end date is before the start date");
        List<FileMovement> list = cap(movements.findByFileIdAndOccurredAtGreaterThanEqualAndOccurredAtLessThanOrderByOccurredAtAsc(
                fileId, time.startOf(start), time.startOf(end.plusDays(1))));
        Map<UUID, String> names = names(list.stream().map(FileMovement::getPerformedBy).toList());
        List<List<String>> rows = list.stream().map(m -> List.of(dayTime(m.getOccurredAt()), sentence(m.getAction().name()),
                names.getOrDefault(m.getPerformedBy(), ""), nz(m.getDepartment()), nz(m.getFromLocation()),
                nz(m.getToLocation()), nz(m.getNotes()))).toList();
        String range = fromDay == null && toDay == null ? "all time" : DAY.format(start) + " to " + DAY.format(end);
        return table(ReportType.MOVEMENT_HISTORY, f.getFileNumber() + " vol. " + f.getVolumeNumber() + " · " + f.getCustomerName()
                        + " · " + range + " · " + rows.size() + " movements",
                List.of(text("When"), text("What"), text("By"), text("Department"), text("From"), text("To"), text("Notes")),
                rows, null, caller);
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private ReportTable table(ReportType type, String subtitle, List<Column> columns, List<List<String>> rows,
                              List<String> totals, AppUserDetails caller) {
        return new ReportTable(type.slug(), type.title(), subtitle, columns, rows, totals, time.now(), caller.fullName());
    }

    private static <T> List<T> cap(List<T> list) {
        if (list.size() > MAX_ROWS) {
            throw ApiException.badRequest("REPORT_TOO_LARGE", "This report has more than " + MAX_ROWS
                    + " rows; narrow the dates or filters");
        }
        return list;
    }

    private static YearMonth yearMonth(int year, int month) {
        if (month < 1 || month > 12 || year < 1900 || year > 2999) throw new IllegalArgumentException("Give a valid year and month");
        return YearMonth.of(year, month);
    }

    private Map<UUID, PhysicalFile> filesById(Collection<UUID> ids) {
        return files.findAllById(ids.stream().distinct().toList()).stream()
                .collect(Collectors.toMap(PhysicalFile::getId, Function.identity()));
    }

    private Map<UUID, String> names(Collection<UUID> ids) {
        Map<UUID, String> m = new HashMap<>();   // tolerates lookups by a null user id
        List<UUID> wanted = ids.stream().filter(Objects::nonNull).distinct().toList();
        if (!wanted.isEmpty()) users.findAllById(wanted).forEach((User u) -> m.put(u.getId(), u.getFullName()));
        return m;
    }

    private Map<UUID, String> departmentNames() {
        Map<UUID, String> m = new HashMap<>();
        departments.findAll().forEach((Department d) -> m.put(d.getId(), d.getName()));
        return m;
    }

    private String dayTime(Instant i) {
        return i == null ? "" : DAY_TIME.format(i.atZone(time.zone()));
    }

    private String clock(Instant i) {
        return i == null ? "" : TIME.format(i.atZone(time.zone()));
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    /** FLAGGED_MISSING → "Flagged missing". */
    static String sentence(String enumName) {
        String s = enumName.replace('_', ' ').toLowerCase();
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    private static String fileStem(ReportTable t, ReportParams p) {
        String suffix = Stream.of(p.date() == null ? null : DAY.format(p.date()),
                        p.year() == null || p.month() == null ? null : "%04d-%02d".formatted(p.year(), p.month()))
                .filter(Objects::nonNull).findFirst().orElse(DAY.format(t.generatedAt().atZone(java.time.ZoneOffset.UTC)));
        return t.type() + "-" + suffix;
    }
}
