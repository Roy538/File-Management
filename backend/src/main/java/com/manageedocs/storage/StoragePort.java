package com.manageedocs.storage;

import java.io.InputStream;
import java.net.URI;
import java.time.Duration;

/**
 * Binary storage behind a port (ADR-006). Keys are always server-generated; callers never
 * pass client filenames or paths. Swap the adapter (S3, MinIO, Azure) without touching callers.
 */
public interface StoragePort {

    /** Stores exactly {@code size} bytes. Overwriting an existing key is a programming error. */
    void put(String key, InputStream content, long size, String contentType);

    InputStream get(String key);

    void copy(String sourceKey, String targetKey);

    /** Keys under {@code prefix} last modified before {@code olderThan} (for orphan reconciliation). */
    java.util.stream.Stream<String> listKeys(String prefix, java.time.Instant olderThan);

    /** Best-effort removal used for compensation; never throws. Returns whether it succeeded. */
    boolean deleteQuietly(String key);

    /**
     * A short-lived download link. {@code downloadName} becomes the Content-Disposition filename;
     * the link reveals neither bucket credentials nor a permanent URL.
     */
    URI presignedDownload(String key, String downloadName, String contentType, Duration ttl, boolean inline);
}
