package com.manageedocs.support;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mysql.MySQLContainer;

/**
 * Real MySQL 8.4 via Testcontainers: Flyway migrates, Hibernate validates the mappings
 * against the actual schema. One container is shared by all subclasses.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@TestPropertySource(properties = {
        "manageedocs.security.refresh-cookie-secure=false",
        "manageedocs.security.jwt-secret=test-secret-0123456789abcdef0123456789abcdef"
})
public abstract class MySqlIntegrationTest {

    @Container
    @ServiceConnection
    static final MySQLContainer MYSQL = new MySQLContainer("mysql:8.4");
}
