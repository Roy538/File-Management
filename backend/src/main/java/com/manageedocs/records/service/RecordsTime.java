package com.manageedocs.records.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * The registry works in calendar days ("due back Friday", "today's dispatches"), so day boundaries
 * use the organisation's local zone rather than UTC. Configured by {@code manageedocs.records.time-zone}.
 */
@Component
public class RecordsTime {

    private final Clock clock;
    private final ZoneId zone;

    public RecordsTime(Clock clock, @Value("${manageedocs.records.time-zone:Africa/Nairobi}") String zone) {
        this.clock = clock;
        this.zone = ZoneId.of(zone);
    }

    public Instant now() {
        return clock.instant();
    }

    public LocalDate today() {
        return LocalDate.now(clock.withZone(zone));
    }

    public Instant startOf(LocalDate day) {
        return day.atStartOfDay(zone).toInstant();
    }

    public LocalDate dayOf(Instant instant) {
        return instant.atZone(zone).toLocalDate();
    }

    public ZoneId zone() {
        return zone;
    }
}
