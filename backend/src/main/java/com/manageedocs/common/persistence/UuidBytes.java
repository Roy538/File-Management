package com.manageedocs.common.persistence;

import java.nio.ByteBuffer;
import java.util.UUID;

/** UUID ⇄ BINARY(16) for the few places that use plain JDBC (search, pipeline status updates). */
public final class UuidBytes {

    private UuidBytes() {
    }

    public static byte[] of(UUID id) {
        return ByteBuffer.allocate(16).putLong(id.getMostSignificantBits()).putLong(id.getLeastSignificantBits()).array();
    }

    public static UUID from(byte[] bytes) {
        ByteBuffer b = ByteBuffer.wrap(bytes);
        return new UUID(b.getLong(), b.getLong());
    }
}
