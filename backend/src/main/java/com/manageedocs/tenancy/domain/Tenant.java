package com.manageedocs.tenancy.domain;

import com.manageedocs.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/** An organisation (legacy "BusinessUnit"). Not itself tenant-scoped. */
@Entity
@Table(name = "tenant")
public class Tenant extends BaseEntity {

    @Column(nullable = false, length = 32, unique = true)
    private String code;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(nullable = false)
    private boolean active = true;

    protected Tenant() {
    }

    public Tenant(String code, String name) {
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

    public void deactivate() {
        this.active = false;
    }
}
