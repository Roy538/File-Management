package com.manageedocs.audit.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class AuditHasherTest {

    private final UUID tenant = UUID.fromString("0190f0e0-0000-7000-8000-000000000001");
    private final Instant at = Instant.parse("2026-11-18T10:15:30.123456Z");

    private String h(String prev, String action, String details) {
        return AuditHasher.hash(prev, tenant, 1, at, null, action, AuditOutcome.SUCCESS, "DOCUMENT", "d1", "c1", details);
    }

    @Test
    void hashIsDeterministic() {
        assertThat(h(AuditChainHead.GENESIS_HASH, "UPLOAD", null)).isEqualTo(h(AuditChainHead.GENESIS_HASH, "UPLOAD", null))
                .hasSize(64);
    }

    @Test
    void anyFieldChangeChangesTheHash() {
        String base = h(AuditChainHead.GENESIS_HASH, "UPLOAD", null);
        assertThat(h(AuditChainHead.GENESIS_HASH, "DELETE", null)).isNotEqualTo(base);
        assertThat(h("1".repeat(64), "UPLOAD", null)).isNotEqualTo(base);
        assertThat(h(AuditChainHead.GENESIS_HASH, "UPLOAD", "{\"a\":\"b\"}")).isNotEqualTo(base);
    }

    @Test
    void subMicrosecondDifferencesDoNotAffectHash() {
        // DB stores microseconds; nanos must not make re-verification fail.
        String a = AuditHasher.hash("p", tenant, 1, at, null, "X", AuditOutcome.SUCCESS, null, null, null, null);
        String b = AuditHasher.hash("p", tenant, 1, at.plusNanos(400), null, "X", AuditOutcome.SUCCESS, null, null, null, null);
        assertThat(a).isEqualTo(b);
    }

    @Test
    void detailsJsonIsCanonicalAndEscaped() {
        assertThat(AuditHasher.toJson(Map.of("b", "2", "a", "x\"y\n"))).isEqualTo("{\"a\":\"x\\\"y\\n\",\"b\":\"2\"}");
        assertThat(AuditHasher.toJson(Map.of())).isNull();
    }
}
