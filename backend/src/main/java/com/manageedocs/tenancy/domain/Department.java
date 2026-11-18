package com.manageedocs.tenancy.domain;

import com.manageedocs.common.persistence.TenantScopedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/** Department / branch within a tenant (legacy "Branch"). */
@Entity
@Table(name = "department")
public class Department extends TenantScopedEntity {

    @Column(nullable = false, length = 32)
    private String code;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(nullable = false)
    private boolean active = true;

    protected Department() {
    }

    public Department(String code, String name) {
        this.code = code.trim().toUpperCase();
        this.name = name.trim();
    }

    public String getCode() {
        return code;
    }

    public String getName() {
        return name;
    }

    public boolean isActive() {
        return active;
    }
}
