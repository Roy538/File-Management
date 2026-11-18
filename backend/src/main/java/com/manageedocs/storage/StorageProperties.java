package com.manageedocs.storage;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

/**
 * @param endpoint       where the API talks to the object store (e.g. http://minio:9000)
 * @param publicEndpoint host browsers use for presigned links (e.g. https://files.example.com);
 *                       defaults to {@code endpoint}
 */
@Validated
@ConfigurationProperties(prefix = "manageedocs.storage")
public record StorageProperties(
        @NotBlank String endpoint,
        String publicEndpoint,
        @NotBlank String region,
        @NotBlank String accessKey,
        @NotBlank String secretKey,
        @NotBlank String bucket,
        boolean pathStyle,
        @NotNull Duration downloadUrlTtl
) {
    public String effectivePublicEndpoint() {
        return publicEndpoint == null || publicEndpoint.isBlank() ? endpoint : publicEndpoint;
    }

    @Override
    public String toString() {
        return "StorageProperties[endpoint=" + endpoint + ", bucket=" + bucket + ", accessKey=***, secretKey=***]";
    }
}
