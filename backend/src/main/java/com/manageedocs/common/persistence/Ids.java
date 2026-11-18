package com.manageedocs.common.persistence;

import java.security.SecureRandom;
import java.util.UUID;

/**
 * Time-ordered UUIDv7 (RFC 9562) generator. Ordered keys keep InnoDB clustered
 * indexes append-mostly, unlike random v4 UUIDs that fragment pages.
 */
public final class Ids {

    private static final SecureRandom RANDOM = new SecureRandom();

    private Ids() {
    }

    public static UUID newId() {
        long millis = System.currentTimeMillis();
        long randA = RANDOM.nextInt(1 << 12);
        long msb = (millis << 16) | (0x7L << 12) | randA;
        long lsb = (RANDOM.nextLong() & 0x3FFF_FFFF_FFFF_FFFFL) | 0x8000_0000_0000_0000L;
        return new UUID(msb, lsb);
    }
}
