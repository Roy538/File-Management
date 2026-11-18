package com.manageedocs.documents.service;

import com.manageedocs.exception.ApiException;
import org.springframework.http.HttpStatus;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Map;
import java.util.function.Predicate;

/**
 * Server-side upload validation. The client's filename and Content-Type are never trusted:
 * the stored type is derived from an allowlisted extension AND the file's leading bytes must match
 * that type's signature (an .exe renamed to .pdf is rejected).
 */
public final class FileInspector {

    private FileInspector() {
    }

    public record Inspected(String safeName, String contentType) {
    }

    private record Kind(String mime, Predicate<byte[]> signature) {
    }

    private static Predicate<byte[]> starts(int... bytes) {
        return b -> {
            if (b.length < bytes.length) return false;
            for (int i = 0; i < bytes.length; i++) if ((b[i] & 0xff) != bytes[i]) return false;
            return true;
        };
    }

    private static final Predicate<byte[]> ZIP = starts(0x50, 0x4b, 0x03, 0x04);                         // docx/xlsx/pptx
    private static final Predicate<byte[]> OLE = starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1); // doc/xls/ppt
    private static final Predicate<byte[]> TIFF = starts(0x49, 0x49, 0x2a, 0x00).or(starts(0x4d, 0x4d, 0x00, 0x2a));
    private static final Predicate<byte[]> TEXT = b -> {
        for (byte x : b) if (x == 0) return false;   // no NUL bytes in the sampled head
        return true;
    };

    private static final Map<String, Kind> ALLOWED = Map.ofEntries(
            Map.entry("pdf", new Kind("application/pdf", starts(0x25, 0x50, 0x44, 0x46))),
            Map.entry("png", new Kind("image/png", starts(0x89, 0x50, 0x4e, 0x47))),
            Map.entry("jpg", new Kind("image/jpeg", starts(0xff, 0xd8, 0xff))),
            Map.entry("jpeg", new Kind("image/jpeg", starts(0xff, 0xd8, 0xff))),
            Map.entry("gif", new Kind("image/gif", starts(0x47, 0x49, 0x46, 0x38))),
            Map.entry("tif", new Kind("image/tiff", TIFF)),
            Map.entry("tiff", new Kind("image/tiff", TIFF)),
            Map.entry("docx", new Kind("application/vnd.openxmlformats-officedocument.wordprocessingml.document", ZIP)),
            Map.entry("xlsx", new Kind("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ZIP)),
            Map.entry("pptx", new Kind("application/vnd.openxmlformats-officedocument.presentationml.presentation", ZIP)),
            Map.entry("doc", new Kind("application/msword", OLE)),
            Map.entry("xls", new Kind("application/vnd.ms-excel", OLE)),
            Map.entry("ppt", new Kind("application/vnd.ms-powerpoint", OLE)),
            Map.entry("txt", new Kind("text/plain", TEXT)),
            Map.entry("csv", new Kind("text/csv", TEXT))
    );

    /** Strips paths, control and unsafe characters; keeps letters/digits in any script; caps length. */
    public static String sanitizeFileName(String raw) {
        String base = raw == null ? "" : raw;
        int slash = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\'));
        base = base.substring(slash + 1);
        String cleaned = Normalizer.normalize(base, Normalizer.Form.NFKC)
                .replaceAll("\\p{Cntrl}", "")
                .replaceAll("[^\\p{L}\\p{N} ._()-]", "_")
                .replaceAll("^\\.+", "")
                .trim();
        if (cleaned.isEmpty()) return "document";
        int dot = cleaned.lastIndexOf('.');
        String ext = dot > 0 ? cleaned.substring(dot).toLowerCase(Locale.ROOT) : "";
        String stem = dot > 0 ? cleaned.substring(0, dot) : cleaned;
        if (stem.length() > 150) stem = stem.substring(0, 150);
        return (stem.isBlank() ? "document" : stem) + ext;
    }

    /**
     * @param head  the first bytes of the file (up to 8 KiB)
     * @param size  total size in bytes
     */
    public static Inspected inspect(String clientName, byte[] head, long size, long maxBytes) {
        if (size <= 0) throw ApiException.badRequest("FILE_EMPTY", "The file is empty");
        if (size > maxBytes) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE",
                    "The file exceeds the maximum size of " + (maxBytes / (1024 * 1024)) + " MB");
        }
        String safe = sanitizeFileName(clientName);
        int dot = safe.lastIndexOf('.');
        String ext = dot > 0 ? safe.substring(dot + 1) : "";
        Kind kind = ALLOWED.get(ext);
        if (kind == null) {
            throw ApiException.badRequest("FILE_TYPE_NOT_ALLOWED",
                    "This file type is not allowed. Allowed: " + String.join(", ", ALLOWED.keySet().stream().sorted().toList()));
        }
        if (!kind.signature().test(head)) {
            throw ApiException.badRequest("FILE_CONTENT_MISMATCH", "The file's content does not match its extension");
        }
        return new Inspected(safe, kind.mime());
    }
}
