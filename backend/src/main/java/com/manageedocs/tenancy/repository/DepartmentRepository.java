package com.manageedocs.tenancy.repository;

import com.manageedocs.tenancy.model.Department;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface DepartmentRepository extends JpaRepository<Department, UUID> {

    List<Department> findAllByOrderByNameAsc();

    boolean existsByCode(String code);
}
