package com.manageedocs.reports.service;

import com.manageedocs.reports.dto.ReportDtos.Column;
import com.manageedocs.reports.dto.ReportDtos.Format;
import com.manageedocs.reports.dto.ReportDtos.ReportFile;
import com.manageedocs.reports.dto.ReportDtos.ReportTable;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/** Renders a {@link ReportTable} as CSV, Excel (.xlsx) or PDF. */
@Component
public class ReportRenderer {

    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm 'UTC'").withZone(ZoneOffset.UTC);

    public ReportFile render(ReportTable t, Format format, String stem) {
        return switch (format) {
            case CSV -> new ReportFile(stem + ".csv", "text/csv; charset=UTF-8", csv(t));
            case XLSX -> new ReportFile(stem + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsx(t));
            case PDF -> new ReportFile(stem + ".pdf", "application/pdf", pdf(t));
            case JSON -> throw new IllegalArgumentException("JSON is returned by the API directly");
        };
    }

    // ── CSV ───────────────────────────────────────────────────────────────

    byte[] csv(ReportTable t) {
        StringBuilder sb = new StringBuilder("﻿");   // BOM so Excel opens UTF-8 correctly
        line(sb, t.columns().stream().map(Column::name).toList());
        t.rows().forEach(r -> line(sb, r));
        if (t.totals() != null) line(sb, t.totals());
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static void line(StringBuilder sb, List<String> cells) {
        for (int i = 0; i < cells.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(csvCell(cells.get(i)));
        }
        sb.append("\r\n");
    }

    /** RFC 4180 quoting, plus a leading apostrophe on cells a spreadsheet would run as a formula. */
    static String csvCell(String v) {
        if (v == null) return "";
        String s = v;
        if (!s.isEmpty() && "=+-@\t\r".indexOf(s.charAt(0)) >= 0 && !s.matches("-?\\d+(\\.\\d+)?")) s = "'" + s;
        if (s.contains(",") || s.contains("\"") || s.contains("\n") || s.contains("\r")) {
            s = "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }

    // ── Excel ─────────────────────────────────────────────────────────────

    byte[] xlsx(ReportTable t) {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet(t.title().length() > 31 ? t.title().substring(0, 31) : t.title());
            Font bold = wb.createFont();
            bold.setBold(true);
            Font titleFont = wb.createFont();
            titleFont.setBold(true);
            titleFont.setFontHeightInPoints((short) 14);
            CellStyle title = wb.createCellStyle();
            title.setFont(titleFont);
            CellStyle header = wb.createCellStyle();
            header.setFont(bold);
            header.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
            header.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            CellStyle totals = wb.createCellStyle();
            totals.setFont(bold);
            CellStyle numberStyle = wb.createCellStyle();
            numberStyle.setAlignment(HorizontalAlignment.RIGHT);

            sheet.createRow(0).createCell(0).setCellValue(t.title());
            sheet.getRow(0).getCell(0).setCellStyle(title);
            sheet.createRow(1).createCell(0).setCellValue(t.subtitle());
            sheet.createRow(2).createCell(0).setCellValue("Generated " + STAMP.format(t.generatedAt()) + " by " + t.generatedBy());

            int r = 4;
            Row h = sheet.createRow(r++);
            for (int c = 0; c < t.columns().size(); c++) {
                h.createCell(c).setCellValue(t.columns().get(c).name());
                h.getCell(c).setCellStyle(header);
            }
            for (List<String> row : t.rows()) writeRow(sheet.createRow(r++), row, t.columns(), numberStyle, null);
            if (t.totals() != null) writeRow(sheet.createRow(r), t.totals(), t.columns(), totals, totals);
            sheet.createFreezePane(0, 5);
            for (int c = 0; c < t.columns().size(); c++) {
                int width = t.columns().get(c).name().length();
                for (List<String> row : t.rows()) width = Math.max(width, row.get(c).length());
                sheet.setColumnWidth(c, Math.min(width + 2, 60) * 256);
            }
            wb.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Numeric columns are written as numbers so totals and sorting work in Excel. */
    private static void writeRow(Row row, List<String> cells, List<Column> cols, CellStyle numeric, CellStyle every) {
        for (int c = 0; c < cells.size(); c++) {
            String v = cells.get(c);
            var cell = row.createCell(c);
            boolean isNumber = cols.get(c).numeric() && v.matches("-?\\d+");
            if (isNumber) cell.setCellValue(Long.parseLong(v));
            else cell.setCellValue(v);
            if (every != null) cell.setCellStyle(every);
            else if (isNumber) cell.setCellStyle(numeric);
        }
    }

    // ── PDF ───────────────────────────────────────────────────────────────

    private static final float MARGIN = 36, FONT_SIZE = 8.5f, ROW_H = 13, PAD = 3;
    private static final Color NAVY = new Color(0x12, 0x33, 0x6B), RULE = new Color(0xD5, 0xDB, 0xE5), ZEBRA = new Color(0xF5, 0xF7, 0xFA);

    byte[] pdf(ReportTable t) {
        PDType1Font regular = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        PDType1Font boldFont = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDRectangle size = new PDRectangle(PDRectangle.A4.getHeight(), PDRectangle.A4.getWidth());   // landscape
            float usable = size.getWidth() - 2 * MARGIN;
            float[] widths = columnWidths(t, regular, boldFont, usable);

            List<List<String>> body = new ArrayList<>(t.rows());
            int index = 0;
            int pageNo = 0;
            boolean totalsDone = t.totals() == null;
            do {
                PDPage page = new PDPage(size);
                doc.addPage(page);
                pageNo++;
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    float y = size.getHeight() - MARGIN;
                    if (pageNo == 1) {
                        text(cs, boldFont, 15, MARGIN, y - 12, t.title(), NAVY);
                        text(cs, regular, 9.5f, MARGIN, y - 28, t.subtitle(), Color.DARK_GRAY);
                        y -= 44;
                    }
                    y = rowAt(cs, t.columns().stream().map(Column::name).toList(), t.columns(), widths, y, boldFont, NAVY, Color.WHITE);
                    boolean zebra = false;
                    while (index < body.size() && y - ROW_H > MARGIN + 16) {
                        y = rowAt(cs, body.get(index++), t.columns(), widths, y, regular, zebra ? ZEBRA : null, Color.BLACK);
                        zebra = !zebra;
                    }
                    if (index >= body.size() && !totalsDone && y - ROW_H > MARGIN + 16) {
                        y = rowAt(cs, t.totals(), t.columns(), widths, y, boldFont, RULE, Color.BLACK);
                        totalsDone = true;
                    }
                    if (body.isEmpty() && pageNo == 1) text(cs, regular, 9.5f, MARGIN, y - 14, "Nothing to report.", Color.DARK_GRAY);
                    text(cs, regular, 7.5f, MARGIN, MARGIN - 4, "Generated " + STAMP.format(t.generatedAt()) + " by "
                            + t.generatedBy() + "  ·  Page " + pageNo, Color.GRAY);
                }
            } while (index < body.size() || !totalsDone);
            doc.save(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private float rowAt(PDPageContentStream cs, List<String> cells, List<Column> cols, float[] widths, float top,
                        PDType1Font font, Color fill, Color ink) throws IOException {
        float x = MARGIN;
        float total = 0;
        for (float w : widths) total += w;
        if (fill != null) {
            cs.setNonStrokingColor(fill);
            cs.addRect(MARGIN, top - ROW_H, total, ROW_H);
            cs.fill();
        }
        cs.setStrokingColor(RULE);
        cs.setLineWidth(0.4f);
        cs.moveTo(MARGIN, top - ROW_H);
        cs.lineTo(MARGIN + total, top - ROW_H);
        cs.stroke();
        for (int c = 0; c < cells.size(); c++) {
            String v = fit(safe(cells.get(c), font), font, widths[c] - 2 * PAD);
            float tx = cols.get(c).numeric() ? x + widths[c] - PAD - width(font, v) : x + PAD;
            text(cs, font, FONT_SIZE, tx, top - ROW_H + 4, v, ink);
            x += widths[c];
        }
        return top - ROW_H;
    }

    /** Proportional to content, but every column gets at least its header and none hogs the page. */
    private static float[] columnWidths(ReportTable t, PDType1Font regular, PDType1Font bold, float usable) throws IOException {
        int n = t.columns().size();
        float[] want = new float[n];
        for (int c = 0; c < n; c++) {
            float w = width(bold, safe(t.columns().get(c).name(), bold));
            for (List<String> row : t.rows().subList(0, Math.min(t.rows().size(), 500))) {
                w = Math.max(w, width(regular, safe(row.get(c), regular)));
            }
            want[c] = Math.min(w, usable * 0.35f) + 2 * PAD;
        }
        float sum = 0;
        for (float w : want) sum += w;
        float scale = usable / sum;
        for (int c = 0; c < n; c++) want[c] *= scale;
        return want;
    }

    private static void text(PDPageContentStream cs, PDType1Font font, float size, float x, float y, String s, Color ink)
            throws IOException {
        cs.beginText();
        cs.setNonStrokingColor(ink);
        cs.setFont(font, size);
        cs.newLineAtOffset(x, y);
        cs.showText(safe(s, font));
        cs.endText();
    }

    private static float width(PDType1Font font, String s) throws IOException {
        return font.getStringWidth(s) / 1000 * FONT_SIZE;
    }

    private static String fit(String s, PDType1Font font, float max) throws IOException {
        if (width(font, s) <= max) return s;
        String cut = s;
        while (!cut.isEmpty() && width(font, cut + "...") > max) cut = cut.substring(0, cut.length() - 1);
        return cut + "...";
    }

    /** The built-in PDF fonts cover Western European text only; anything else becomes '?' rather than failing. */
    static String safe(String s, PDType1Font font) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder(s.length());
        s.codePoints().forEach(cp -> {
            String ch = new String(Character.toChars(cp));
            if (cp == '\n' || cp == '\r' || cp == '\t') { sb.append(' '); return; }
            try {
                font.encode(ch);
                sb.append(ch);
            } catch (IOException | IllegalArgumentException e) {
                sb.append('?');
            }
        });
        return sb.toString();
    }
}
