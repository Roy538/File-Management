package com.manageedocs.identity.repository;

import com.manageedocs.identity.model.User;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/** Tenant-scoped automatically via {@code @TenantId}; no query here can cross tenants. */
public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmail(String normalizedEmail);

    java.util.List<User> findByRoleAndActiveTrue(com.manageedocs.identity.model.Role role);
}
