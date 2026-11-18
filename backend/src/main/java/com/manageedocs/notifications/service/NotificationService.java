package com.manageedocs.notifications.service;

import com.manageedocs.common.dto.PagedResponse;
import com.manageedocs.exception.ApiException;
import com.manageedocs.identity.model.Role;
import com.manageedocs.identity.model.User;
import com.manageedocs.identity.repository.UserRepository;
import com.manageedocs.notifications.model.Notification;
import com.manageedocs.notifications.repository.NotificationRepository;
import com.manageedocs.security.AppUserDetails;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

/**
 * In-app notifications. Written inside the caller's transaction, so a notification exists only if
 * the change it announces committed. Email delivery is a later channel on top of the same rows.
 */
@Service
public class NotificationService {

    public record NotificationView(UUID id, String type, String title, String body, String resourceType,
                                   UUID resourceId, Instant readAt, Instant createdAt) {
        static NotificationView of(Notification n) {
            return new NotificationView(n.getId(), n.getType(), n.getTitle(), n.getBody(), n.getResourceType(),
                    n.getResourceId(), n.getReadAt(), n.getCreatedAt());
        }
    }

    private final NotificationRepository notifications;
    private final UserRepository users;
    private final Clock clock;

    public NotificationService(NotificationRepository notifications, UserRepository users, Clock clock) {
        this.notifications = notifications;
        this.users = users;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void notifyUsers(Collection<UUID> userIds, String type, String title, String body,
                            String resourceType, UUID resourceId) {
        Instant now = clock.instant();
        for (UUID id : new LinkedHashSet<>(userIds)) {
            notifications.save(new Notification(id, type, title, body, resourceType, resourceId, now));
        }
    }

    /** Active members of a role in the current organisation, optionally excluding someone (e.g. the submitter). */
    @Transactional(propagation = Propagation.MANDATORY)
    public Set<UUID> membersOf(Role role, UUID except) {
        Set<UUID> ids = new LinkedHashSet<>();
        for (User u : users.findByRoleAndActiveTrue(role)) {
            if (!u.getId().equals(except)) ids.add(u.getId());
        }
        return ids;
    }

    @Transactional(readOnly = true)
    public PagedResponse<NotificationView> inbox(AppUserDetails caller, boolean unreadOnly, int page, int size) {
        PageRequest pr = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100));
        return PagedResponse.of(unreadOnly
                ? notifications.findByUserIdAndReadAtIsNullOrderByCreatedAtDesc(caller.userId(), pr)
                : notifications.findByUserIdOrderByCreatedAtDesc(caller.userId(), pr), NotificationView::of);
    }

    @Transactional(readOnly = true)
    public long unreadCount(AppUserDetails caller) {
        return notifications.countByUserIdAndReadAtIsNull(caller.userId());
    }

    @Transactional
    public void markRead(AppUserDetails caller, UUID id) {
        Notification n = notifications.findById(id)
                .filter(x -> x.getUserId().equals(caller.userId()))   // someone else's notification is "not found"
                .orElseThrow(() -> ApiException.notFound("Notification"));
        n.markRead(clock.instant());
    }

    @Transactional
    public int markAllRead(AppUserDetails caller) {
        return notifications.markAllRead(caller.userId(), clock.instant());
    }
}
