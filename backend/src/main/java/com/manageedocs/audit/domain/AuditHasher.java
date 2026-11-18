package com.manageedocs.audit.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.UUID;

/** Canonical serialisation + SHA-256 chaining. Any edit to a stored row breaks verification. */
public final class AuditHasher {

    private AuditHasher() {
    }

    public static String hash(String prevHash, UUID tenantId, long seq, Instant occurredAt, UUID actorId,
                              String action, AuditOutcome outcome, String resourceType, String resourceId,
                              String correlationId, String details) {
        String canonical = String.join("\u001f",
                prevHash,
                tenantId.toString(),
                Long.toString(seq),
                // DB keeps microseconds; hash the same precision so re-verification matches.
                occurredAt.truncatedTo(ChronoUnit.MICROS).toString(),
                Objects.toString(actorId, ""),
                action,
                outcome.name(),
                Objects.toString(resourceType, ""),
                Objects.toString(resourceId, ""),
                Objects.toString(correlationId, ""),
                Objects.toString(details, ""));
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public static String hashOf(AuditEvent e) {
        return hash(e.getPrevHash(), e.getTenantId(), e.getSeq(), e.getOccurredAt(), e.getActorId(), e.getAction(),
                e.getOutcome(), e.getResourceType(), e.getResourceId(), e.getCorrelationId(), e.getDetails());
    }

    /** Deterministic JSON object from string pairs (sorted keys), so hashing is stable. */
    public static String toJson(Map<String, String> details) {
        if (details == null || details.isEmpty()) {
            return null;
        }
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, String> e : new TreeMap<>(details).entrySet()) {
            if (!first) sb.append(',');
            first = false;
            sb.append('"').append(escape(e.getKey())).append("\":");
            if (e.getValue() == null) {
                sb.append("null");
            } else {
                sb.append('"').append(escape(e.getValue())).append('"');
            }
        }
        return sb.append('}').toString();
    }

    private static String escape(String s) {
        StringBuilder sb = new StringBuilder(s.length() + 8);
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        return sb.toString();
    }
}
