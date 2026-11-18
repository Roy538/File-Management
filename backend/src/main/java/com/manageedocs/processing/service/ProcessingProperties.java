package com.manageedocs.processing.service;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

/**
 * @param pollerEnabled     off in tests, which drive {@code ProcessingWorker.runOnce()} directly
 * @param claimTimeout      a RUNNING job older than this is presumed orphaned and made due again
 * @param maxExtractedChars text beyond this is not indexed (job records truncation)
 * @param clamavHost        blank = scanning disabled (versions are marked SKIPPED, not CLEAN)
 * @param orphanAge         stored objects with no version row older than this are deleted
 */
@Validated
@ConfigurationProperties(prefix = "manageedocs.processing")
public record ProcessingProperties(
        boolean pollerEnabled,
        @Min(1) int batchSize,
        @NotNull Duration claimTimeout,
        @Min(1) int maxAttempts,
        @NotNull Duration retryBase,
        @Min(1000) int maxExtractedChars,
        String clamavHost,
        int clamavPort,
        @NotNull Duration clamavTimeout,
        @NotNull Duration orphanAge
) {
    public boolean scanningEnabled() {
        return clamavHost != null && !clamavHost.isBlank();
    }
}
