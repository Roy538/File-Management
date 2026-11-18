package com.manageedocs.common.persistence;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class IdsTest {

    @Test
    void producesRfc9562Version7Uuids() {
        UUID id = Ids.newId();
        assertThat(id.version()).isEqualTo(7);
        assertThat(id.variant()).isEqualTo(2);
    }

    @Test
    void idsAreUniqueAndTimeOrderedAcrossMilliseconds() throws InterruptedException {
        UUID first = Ids.newId();
        Thread.sleep(2);
        UUID second = Ids.newId();
        assertThat(Long.compareUnsigned(first.getMostSignificantBits(), second.getMostSignificantBits())).isNegative();

        Set<UUID> seen = new HashSet<>();
        for (int i = 0; i < 10_000; i++) seen.add(Ids.newId());
        assertThat(seen).hasSize(10_000);
    }
}
