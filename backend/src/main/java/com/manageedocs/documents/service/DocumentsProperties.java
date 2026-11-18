package com.manageedocs.documents.service;

import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

/**
 * @param maxFileSizeBytes per-file upload ceiling (keep in step with spring.servlet.multipart)
 * @param lockDuration     how long a check-out lock lasts before it lapses on its own
 */
@Validated
@ConfigurationProperties(prefix = "manageedocs.documents")
public record DocumentsProperties(@Positive long maxFileSizeBytes, @NotNull Duration lockDuration) {
}
