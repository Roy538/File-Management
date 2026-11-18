package com.manageedocs.support;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MinIOContainer;
import org.testcontainers.mysql.MySQLContainer;

/**
 * Real MySQL 8.4 and real MinIO via Testcontainers: Flyway migrates, Hibernate validates the
 * mappings against the actual schema, and binaries really go to S3-compatible storage.
 * Containers start once per JVM (singleton pattern) and are shared by every subclass, so the
 * cached Spring context never points at a stopped container.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class MySqlIntegrationTest {

    @ServiceConnection
    static final MySQLContainer MYSQL = new MySQLContainer("mysql:8.4");

    static final MinIOContainer MINIO = new MinIOContainer("minio/minio:RELEASE.2025-09-07T16-13-09Z");

    static {
        MYSQL.start();
        MINIO.start();
    }

    @DynamicPropertySource
    static void storage(DynamicPropertyRegistry r) {
        r.add("manageedocs.storage.endpoint", MINIO::getS3URL);
        r.add("manageedocs.storage.access-key", MINIO::getUserName);
        r.add("manageedocs.storage.secret-key", MINIO::getPassword);
        r.add("manageedocs.storage.bucket", () -> "manageedocs-test");
    }
}
