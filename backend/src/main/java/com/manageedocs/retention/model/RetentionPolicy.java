package com.manageedocs.retention.model;

import com.manageedocs.common.persistence.TenantScopedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.Period;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;

/** How long documents are kept, counted from when, and what happens at the end. */
@Entity
@Table(name = "retention_policy")
public class RetentionPolicy extends TenantScopedEntity {

    public enum Trigger { CREATED, LAST_MODIFIED }

    /** ARCHIVE is applied automatically (non-destructive); DESTROY only through an approved disposition run. */
    public enum Action { ARCHIVE, DESTROY }

    @Column(nullable = false, length = 200)
    private String name;

    @Column(length = 1000)
    private String description;

    @Column(name = "retain_for", nullable = false, length = 16)
    private String retainFor;

    @Enumerated(EnumType.STRING)
    @Column(name = "trigger_event", nullable = false, length = 16)
    private Trigger trigger;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Action action;

    @Column(nullable = false)
    private boolean active = true;

    protected RetentionPolicy() {
    }

    public RetentionPolicy(String name, String description, String retainFor, Trigger trigger, Action action) {
        this.name = name.trim();
        this.description = description == null || description.isBlank() ? null : description.trim();
        this.retainFor = validPeriod(retainFor);
        this.trigger = trigger;
        this.action = action;
    }

    static String validPeriod(String iso) {
        try {
            Period p = Period.parse(iso);
            if (p.isNegative()) throw new IllegalArgumentException("Retention period cannot be negative");
            return p.toString();
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("Retention period must be ISO-8601, e.g. P7Y, P18M or P90D");
        }
    }

    /** Documents whose trigger date is on or before this instant are due. */
    public Instant dueCutoff(Instant now) {
        return now.atZone(ZoneOffset.UTC).minus(Period.parse(retainFor)).toInstant();
    }

    public Instant dueAt(Instant triggerDate) {
        return triggerDate.atZone(ZoneOffset.UTC).plus(Period.parse(retainFor)).toInstant();
    }

    public void deactivate() {
        this.active = false;
    }

    public String getName() { return name; }
    public String getDescription() { return description; }
    public String getRetainFor() { return retainFor; }
    public Trigger getTrigger() { return trigger; }
    public Action getAction() { return action; }
    public boolean isActive() { return active; }
}
