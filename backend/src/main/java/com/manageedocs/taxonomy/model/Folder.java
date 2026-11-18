package com.manageedocs.taxonomy.model;

import com.manageedocs.common.persistence.TenantScopedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.SQLRestriction;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Folder in a cabinet. {@code path} is the materialised chain of ids from the root folder to this
 * one ("/a/b/c/"), giving O(1) ancestor lookup for permission inheritance and prefix subtree queries.
 */
@Entity
@Table(name = "folder")
@SQLRestriction("deleted_at is null")
public class Folder extends TenantScopedEntity {

    public static final int MAX_DEPTH = 32;

    @Column(name = "cabinet_id", nullable = false)
    private UUID cabinetId;

    @Column(name = "parent_id")
    private UUID parentId;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(nullable = false, length = 1700)
    private String path;

    @Column(nullable = false)
    private int depth;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    protected Folder() {
    }

    public static Folder root(UUID cabinetId, String name) {
        Folder f = new Folder();
        f.cabinetId = cabinetId;
        f.name = name.trim();
        f.depth = 1;
        f.path = "/" + hex(f.getId()) + "/";
        return f;
    }

    public static Folder childOf(Folder parent, String name) {
        if (parent.depth >= MAX_DEPTH) {
            throw new IllegalArgumentException("Folders cannot be nested more than " + MAX_DEPTH + " levels deep");
        }
        Folder f = new Folder();
        f.cabinetId = parent.cabinetId;
        f.parentId = parent.getId();
        f.name = name.trim();
        f.depth = parent.depth + 1;
        f.path = parent.path + hex(f.getId()) + "/";
        return f;
    }

    /** True if {@code other} is this folder or lies beneath it. */
    public boolean contains(Folder other) {
        return other.path.startsWith(this.path);
    }

    /** Ids of this folder and all its ancestors, root first. */
    public List<UUID> lineage() {
        List<UUID> ids = new ArrayList<>(depth);
        for (String part : path.split("/")) {
            if (!part.isEmpty()) ids.add(fromHex(part));
        }
        return ids;
    }

    /**
     * Re-homes this folder (moved under {@code newParent}, or to the root of {@code newCabinetId}).
     * Returns the old path prefix so the caller can rewrite descendants with {@link #rebase}.
     */
    public String moveTo(UUID newCabinetId, Folder newParent) {
        String oldPath = path;
        this.cabinetId = newParent != null ? newParent.cabinetId : newCabinetId;
        this.parentId = newParent != null ? newParent.getId() : null;
        this.depth = newParent != null ? newParent.depth + 1 : 1;
        this.path = (newParent != null ? newParent.path : "/") + hex(getId()) + "/";
        return oldPath;
    }

    /** Applied to each descendant after an ancestor moved from {@code oldPrefix} to {@code moved.path}. */
    public void rebase(String oldPrefix, Folder moved) {
        if (!path.startsWith(oldPrefix)) throw new IllegalStateException("Not a descendant");
        this.path = moved.path + path.substring(oldPrefix.length());
        this.cabinetId = moved.cabinetId;
        this.depth = (int) path.chars().filter(c -> c == '/').count() - 1;
        if (depth > MAX_DEPTH) throw new IllegalArgumentException("Move would exceed the maximum folder depth");
    }

    public void rename(String newName) {
        this.name = newName.trim();
    }

    public void softDelete(Instant at) {
        this.deletedAt = at;
    }

    public static String hex(UUID id) {
        return id.toString().replace("-", "");
    }

    static UUID fromHex(String hex) {
        return UUID.fromString(hex.substring(0, 8) + "-" + hex.substring(8, 12) + "-" + hex.substring(12, 16) + "-"
                + hex.substring(16, 20) + "-" + hex.substring(20));
    }

    public UUID getCabinetId() { return cabinetId; }
    public UUID getParentId() { return parentId; }
    public String getName() { return name; }
    public String getPath() { return path; }
    public int getDepth() { return depth; }
}
