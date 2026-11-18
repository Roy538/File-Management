package com.manageedocs.identity.domain;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/** Tenant-scoped automatically via {@code @TenantId}; no query here can cross tenants. */
public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmail(String normalizedEmail);
}
