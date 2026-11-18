package com.manageedocs.taxonomy.model;

import com.manageedocs.common.persistence.TenantScopedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.time.Instant;
import java.util.UUID;

/** A tab inside a folder (e.g. "Payroll and Tax Documents"); inherits the folder's permissions. */
@Entity
@Table(name = "sub_divider")
@SQLRestriction("deleted_at is null")
public class SubDivider extends TenantScopedEntity {

    @Column(name = "folder_id", nullable = false)
    private UUID folderId;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    protected SubDivider() {
    }

    public SubDivider(UUID folderId, String name) {
        this.folderId = folderId;
        this.name = name.trim();
    }

    public void rename(String newName) {
        this.name = newName.trim();
    }

    public void moveTo(UUID newFolderId) {
        this.folderId = newFolderId;
    }

    public void softDelete(Instant at) {
        this.deletedAt = at;
    }

    public UUID getFolderId() { return folderId; }
    public String getName() { return name; }
}
