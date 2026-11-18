package com.manageedocs.storage;

import com.manageedocs.processing.service.ProcessingProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Storage/database consistency (directive 6.2). Bytes are written before the database row, and a
 * failed transaction deletes them again — but if that compensating delete also fails (storage blip,
 * crash), an object is left that no version references. This sweep removes such objects once they
 * are older than {@code orphan-age}, which is far longer than any upload transaction can take, so an
 * in-flight upload is never mistaken for an orphan. Referenced objects are never touched.
 */
@Component
public class OrphanObjectSweeper {

    private static final Logger log = LoggerFactory.getLogger(OrphanObjectSweeper.class);
    private static final int BATCH = 500;

    private final StoragePort storage;
    private final NamedParameterJdbcTemplate jdbc;
    private final ProcessingProperties props;
    private final Clock clock;

    public OrphanObjectSweeper(StoragePort storage, NamedParameterJdbcTemplate jdbc, ProcessingProperties props, Clock clock) {
        this.storage = storage;
        this.jdbc = jdbc;
        this.props = props;
        this.clock = clock;
    }

    @Scheduled(cron = "${manageedocs.processing.orphan-sweep-cron:0 30 2 * * *}")
    void scheduled() {
        if (!props.pollerEnabled()) return;
        try {
            sweep();
        } catch (RuntimeException e) {
            log.error("Orphan sweep failed", e);
        }
    }

    /** Returns the number of orphaned objects deleted. */
    public int sweep() {
        List<String> batch = new ArrayList<>(BATCH);
        int[] deleted = {0};
        storage.listKeys("t/", clock.instant().minus(props.orphanAge())).forEach(key -> {
            batch.add(key);
            if (batch.size() == BATCH) {
                deleted[0] += deleteUnreferenced(batch);
                batch.clear();
            }
        });
        if (!batch.isEmpty()) deleted[0] += deleteUnreferenced(batch);
        if (deleted[0] > 0) log.warn("Removed {} orphaned storage object(s)", deleted[0]);
        return deleted[0];
    }

    private int deleteUnreferenced(List<String> keys) {
        Set<String> referenced = new HashSet<>(jdbc.queryForList(
                "select storage_key from document_version where storage_key in (:keys)",
                new MapSqlParameterSource("keys", keys), String.class));
        int n = 0;
        for (String k : keys) {
            if (!referenced.contains(k) && storage.deleteQuietly(k)) n++;
        }
        return n;
    }
}
