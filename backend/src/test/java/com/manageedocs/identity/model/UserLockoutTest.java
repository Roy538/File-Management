package com.manageedocs.identity.model;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class UserLockoutTest {

    private final Instant now = Instant.parse("2026-11-18T10:00:00Z");

    private User user() {
        return new User("  Jane.Doe@Example.COM ", "hash", "Jane", "Doe", Role.OFFICER, null);
    }

    @Test
    void emailIsNormalised() {
        assertThat(user().getEmail()).isEqualTo("jane.doe@example.com");
    }

    @Test
    void locksAfterMaxFailuresAndUnlocksAfterDuration() {
        User u = user();
        for (int i = 0; i < 4; i++) u.recordFailedLogin(now, 5, Duration.ofMinutes(15));
        assertThat(u.canLogIn(now)).isTrue();
        u.recordFailedLogin(now, 5, Duration.ofMinutes(15));
        assertThat(u.isLocked(now)).isTrue();
        assertThat(u.canLogIn(now.plus(Duration.ofMinutes(14)))).isFalse();
        assertThat(u.canLogIn(now.plus(Duration.ofMinutes(16)))).isTrue();
    }

    @Test
    void successfulLoginResetsCounter() {
        User u = user();
        u.recordFailedLogin(now, 5, Duration.ofMinutes(15));
        u.recordSuccessfulLogin(now);
        assertThat(u.getFailedLoginCount()).isZero();
        assertThat(u.getLastLoginAt()).isEqualTo(now);
    }
}
