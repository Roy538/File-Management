package com.manageedocs.documents.service;

import com.manageedocs.exception.ApiException;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FileInspectorTest {

    private static final byte[] PDF = "%PDF-1.7".getBytes(StandardCharsets.US_ASCII);
    private static final long MAX = 1024;

    @Test
    void sanitisesPathsControlCharactersAndHiddenNames() {
        assertThat(FileInspector.sanitizeFileName("../../etc/passwd")).isEqualTo("passwd");
        assertThat(FileInspector.sanitizeFileName("..\\..\\boot.ini")).isEqualTo("boot.ini");
        assertThat(FileInspector.sanitizeFileName("a\u0000b<script>.PDF")).isEqualTo("ab_script_.pdf");
        assertThat(FileInspector.sanitizeFileName(".htaccess")).isEqualTo("htaccess");
        assertThat(FileInspector.sanitizeFileName(null)).isEqualTo("document");
        // Non-Latin letters are kept; dashes other than ASCII hyphen are replaced.
        assertThat(FileInspector.sanitizeFileName("Mkataba wa Kazi – Ñandú.pdf"))
                .isEqualTo("Mkataba wa Kazi _ Ñandú.pdf");
    }

    @Test
    void derivesTheTypeFromContentNotFromTheClient() {
        assertThat(FileInspector.inspect("Report.PDF", PDF, 10, MAX).contentType()).isEqualTo("application/pdf");
        assertThatThrownBy(() -> FileInspector.inspect("invoice.pdf", new byte[]{'M', 'Z'}, 10, MAX))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("FILE_CONTENT_MISMATCH"));
        assertThatThrownBy(() -> FileInspector.inspect("run.exe", new byte[]{'M', 'Z'}, 10, MAX))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("FILE_TYPE_NOT_ALLOWED"));
        assertThatThrownBy(() -> FileInspector.inspect("notes.txt", new byte[]{'a', 0, 'b'}, 3, MAX))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void enforcesSizeLimits() {
        assertThatThrownBy(() -> FileInspector.inspect("a.pdf", PDF, 0, MAX))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("FILE_EMPTY"));
        assertThatThrownBy(() -> FileInspector.inspect("a.pdf", PDF, MAX + 1, MAX))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status().value()).isEqualTo(413));
    }
}
