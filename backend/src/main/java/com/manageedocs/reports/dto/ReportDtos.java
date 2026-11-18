package com.manageedocs.reports.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class ReportDtos {

    private ReportDtos() {
    }

    /** The registry reports ported from the legacy system; {@code slug} is the URL segment. */
    public enum ReportType {
        OUTSTANDING("outstanding", "Files out on loan"),
        DAILY_DISPATCHES("daily-dispatches", "Dispatches for the day"),
        DAILY_RETURNS("daily-returns", "Returns for the day"),
        MISSING("missing", "Missing files"),
        BY_DEPARTMENT("by-department", "Files by department"),
        MONTHLY("monthly", "Monthly movement summary"),
        MOVEMENT_HISTORY("movement-history", "File movement history");

        private final String slug;
        private final String title;

        ReportType(String slug, String title) {
            this.slug = slug;
            this.title = title;
        }

        public String slug() { return slug; }
        public String title() { return title; }

        public static ReportType fromSlug(String slug) {
            for (ReportType t : values()) if (t.slug.equals(slug)) return t;
            throw new IllegalArgumentException("Unknown report: " + slug);
        }
    }

    public enum Format { JSON, CSV, XLSX, PDF }

    /** Inputs; each report uses the ones it needs (date; year + month; fileId + from + to). */
    public record ReportParams(LocalDate date, Integer year, Integer month, UUID fileId, LocalDate from, LocalDate to) {
    }

    public record Column(String name, boolean numeric) {
        public static Column text(String name) { return new Column(name, false); }
        public static Column number(String name) { return new Column(name, true); }
    }

    /** A rendered-agnostic table: every cell is display text, so CSV, Excel, PDF and the UI agree exactly. */
    public record ReportTable(String type, String title, String subtitle, List<Column> columns, List<List<String>> rows,
                              List<String> totals, Instant generatedAt, String generatedBy) {
    }

    public record ReportFile(String fileName, String contentType, byte[] bytes) {
    }
}
