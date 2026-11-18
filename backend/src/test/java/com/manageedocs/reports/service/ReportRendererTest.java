package com.manageedocs.reports.service;

import com.manageedocs.reports.dto.ReportDtos.Column;
import com.manageedocs.reports.dto.ReportDtos.ReportTable;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

class ReportRendererTest {

    private final ReportRenderer renderer = new ReportRenderer();

    @Test
    void csvQuotesAndDefusesSpreadsheetFormulas() {
        assertThat(ReportRenderer.csvCell("plain")).isEqualTo("plain");
        assertThat(ReportRenderer.csvCell("a,b")).isEqualTo("\"a,b\"");
        assertThat(ReportRenderer.csvCell("say \"hi\"")).isEqualTo("\"say \"\"hi\"\"\"");
        assertThat(ReportRenderer.csvCell("=HYPERLINK(\"x\")")).startsWith("\"'=");
        assertThat(ReportRenderer.csvCell("@SUM(A1)")).isEqualTo("'@SUM(A1)");
        assertThat(ReportRenderer.csvCell("-5")).isEqualTo("-5");   // a real negative number stays a number
    }

    @Test
    void excelKeepsNumbersNumericAndTotalsLast() throws Exception {
        byte[] bytes = renderer.xlsx(table(3, List.of("Total", "6")));
        try (XSSFWorkbook wb = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            var sheet = wb.getSheetAt(0);
            assertThat(sheet.getRow(4).getCell(0).getStringCellValue()).isEqualTo("Name");
            assertThat(sheet.getRow(5).getCell(1).getNumericCellValue()).isEqualTo(1.0);
            assertThat(sheet.getRow(8).getCell(1).getNumericCellValue()).isEqualTo(6.0);
        }
    }

    @Test
    void pdfPaginatesLongReportsKeepsTotalsAndSurvivesUnsupportedCharacters() throws Exception {
        byte[] bytes = renderer.pdf(table(120, List.of("Total", "7260")));
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            assertThat(doc.getNumberOfPages()).isGreaterThan(1);
            String text = new PDFTextStripper().getText(doc);
            assertThat(text).contains("Row 120").contains("7260").contains("Zoë").contains("Page 2");
        }
    }

    private static ReportTable table(int n, List<String> totals) {
        List<List<String>> rows = new ArrayList<>();
        IntStream.rangeClosed(1, n).forEach(i -> rows.add(List.of(i == 2 ? "Zoë 王" : "Row " + i, Integer.toString(i))));
        return new ReportTable("t", "Test report", "Sub", List.of(Column.text("Name"), Column.number("Count")), rows,
                totals, Instant.parse("2026-11-18T10:00:00Z"), "Tester");
    }
}
