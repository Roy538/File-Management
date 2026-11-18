package com.manageedocs.permissions.model;

import java.util.EnumSet;
import java.util.Set;

/**
 * Per-object access rights (cabinet/folder/document), stored as a bitmask in {@code acl_entry.permissions}.
 * Bit values are persisted — never renumber an existing constant.
 */
public enum ResourceRight {
    VIEW(1),
    DOWNLOAD(1 << 1),
    /** Create documents in a folder. */
    UPLOAD(1 << 2),
    /** Change title/metadata, add or restore versions, check out. */
    EDIT(1 << 3),
    DELETE(1 << 4),
    SHARE(1 << 5),
    /** Manage structure (folders, sub-dividers) and ACLs. */
    MANAGE(1 << 6);

    public static final int READ = VIEW.bit | DOWNLOAD.bit;
    public static final int CONTRIBUTE = READ | UPLOAD.bit | EDIT.bit;
    public static final int FULL = allBits();

    private final int bit;

    ResourceRight(int bit) {
        this.bit = bit;
    }

    public int bit() {
        return bit;
    }

    public boolean in(int mask) {
        return (mask & bit) != 0;
    }

    public static Set<ResourceRight> fromMask(int mask) {
        EnumSet<ResourceRight> set = EnumSet.noneOf(ResourceRight.class);
        for (ResourceRight p : values()) {
            if (p.in(mask)) set.add(p);
        }
        return set;
    }

    public static int toMask(Iterable<ResourceRight> permissions) {
        int m = 0;
        for (ResourceRight p : permissions) m |= p.bit;
        return m;
    }

    private static int allBits() {
        int m = 0;
        for (ResourceRight p : values()) m |= p.bit;
        return m;
    }
}
