package com.manageedocs.tenancy.service;

import com.manageedocs.exception.ApiException;

/** Minimum password rules (NIST 800-63B style: length over composition, cap for BCrypt's 72-byte limit). */
public final class PasswordPolicy {

    public static final int MIN_LENGTH = 12;
    public static final int MAX_BYTES = 72;

    private PasswordPolicy() {
    }

    public static void validate(String raw) {
        if (raw == null || raw.length() < MIN_LENGTH) {
            throw ApiException.badRequest("WEAK_PASSWORD", "Password must be at least " + MIN_LENGTH + " characters");
        }
        if (raw.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > MAX_BYTES) {
            throw ApiException.badRequest("PASSWORD_TOO_LONG", "Password must be at most " + MAX_BYTES + " bytes");
        }
        if (raw.isBlank() || raw.chars().distinct().count() < 4) {
            throw ApiException.badRequest("WEAK_PASSWORD", "Password is too simple");
        }
    }
}
