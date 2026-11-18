package com.manageedocs.notifications.model;

import com.manageedocs.common.persistence.Ids;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "notification")
public class Notification {

    @Id
    private UUID id = Ids.newId();

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 48)
    private String type;

    @Column(nullable = false, length = 300)
    private String title;

    @Column(length = 1000)
    private String body;

    @Column(name = "resource_type", length = 32)
    private String resourceType;

    @Column(name = "resource_id")
    private UUID resourceId;

    @Column(name = "read_at")
    private Instant readAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Notification() {
    }

    public Notification(UUID userId, String type, String title, String body, String resourceType, UUID resourceId,
                        Instant createdAt) {
        this.userId = userId;
        this.type = type;
        this.title = title.length() > 300 ? title.substring(0, 300) : title;
        this.body = body == null ? null : body.length() > 1000 ? body.substring(0, 1000) : body;
        this.resourceType = resourceType;
        this.resourceId = resourceId;
        this.createdAt = createdAt;
    }

    public void markRead(Instant at) {
        if (readAt == null) readAt = at;
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getType() { return type; }
    public String getTitle() { return title; }
    public String getBody() { return body; }
    public String getResourceType() { return resourceType; }
    public UUID getResourceId() { return resourceId; }
    public Instant getReadAt() { return readAt; }
    public Instant getCreatedAt() { return createdAt; }
}
