package com.manageedocs.config;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;
import java.util.List;

@Validated
@ConfigurationProperties(prefix = "manageedocs.security")
public record SecurityProperties(
        @NotBlank String jwtSecret,
        @NotNull Duration accessTokenTtl,
        @NotNull Duration refreshTokenTtl,
        boolean refreshCookieSecure,
        @Min(1) int maxFailedLogins,
        @NotNull Duration lockoutDuration,
        List<String> corsOrigins
) {
    public SecurityProperties {
        if (jwtSecret != null && jwtSecret.getBytes(java.nio.charset.StandardCharsets.UTF_8).length < 32) {
            throw new IllegalArgumentException("manageedocs.security.jwt-secret must be at least 32 bytes");
        }
    }
}
