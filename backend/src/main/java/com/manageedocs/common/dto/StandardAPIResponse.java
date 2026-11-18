package com.manageedocs.common.dto;

import com.manageedocs.common.web.CorrelationIdFilter;
import org.slf4j.MDC;

import java.time.Instant;

/**
 * The one response envelope for every endpoint: {@code {data, errors, message, successful,
 * timestamp, code, correlationId}}. {@code code} is a stable machine-readable error code
 * (null on success); {@code correlationId} ties a response to its log lines and audit rows.
 */
public record StandardAPIResponse<T>(
        T data,
        Object errors,
        String message,
        boolean successful,
        Instant timestamp,
        String code,
        String correlationId
) {

    /** A successful response carrying a payload. */
    public static <T> StandardAPIResponse<T> success(T data, String message) {
        return new StandardAPIResponse<>(data, null, message, true, Instant.now(), null, currentCorrelationId());
    }

    /** A successful response with nothing to return — a delete, a status change. */
    public static StandardAPIResponse<Void> success(String message) {
        return new StandardAPIResponse<>(null, null, message, true, Instant.now(), null, currentCorrelationId());
    }

    public static StandardAPIResponse<Void> failure(String code, String message) {
        return failure(code, message, null);
    }

    /** A failure with per-field detail, e.g. bean-validation messages keyed by field. */
    public static StandardAPIResponse<Void> failure(String code, String message, Object errors) {
        return new StandardAPIResponse<>(null, errors, message, false, Instant.now(), code, currentCorrelationId());
    }

    private static String currentCorrelationId() {
        return MDC.get(CorrelationIdFilter.MDC_KEY);
    }
}
