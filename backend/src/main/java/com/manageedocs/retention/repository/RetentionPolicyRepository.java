package com.manageedocs.retention.repository;

import com.manageedocs.retention.model.RetentionPolicy;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface RetentionPolicyRepository extends JpaRepository<RetentionPolicy, UUID> {

    List<RetentionPolicy> findAllByOrderByNameAsc();

    List<RetentionPolicy> findByActiveTrue();

    boolean existsByNameIgnoreCase(String name);
}
