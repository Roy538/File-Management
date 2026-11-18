package com.manageedocs.records.service;

import com.manageedocs.identity.model.Role;
import com.manageedocs.notifications.service.NotificationService;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

/**
 * Registry alerts. "Registry staff" are the organisation's officers and administrators, the roles
 * that hold RECORDS_DISPATCH by default. Runs inside the caller's transaction (see NotificationService).
 */
@Component
public class RegistryNotifier {

    static final String RESOURCE = "PHYSICAL_FILE";

    private final NotificationService notifications;

    public RegistryNotifier(NotificationService notifications) {
        this.notifications = notifications;
    }

    public void registryStaff(UUID except, String type, String title, String body, UUID fileId) {
        Set<UUID> to = new LinkedHashSet<>(notifications.membersOf(Role.OFFICER, except));
        to.addAll(notifications.membersOf(Role.ADMIN, except));
        notifications.notifyUsers(to, type, title, body, RESOURCE, fileId);
    }

    public void administrators(String type, String title, String body, UUID fileId) {
        notifications.notifyUsers(notifications.membersOf(Role.ADMIN, null), type, title, body, RESOURCE, fileId);
    }

    public void users(Collection<UUID> userIds, String type, String title, String body, UUID fileId) {
        notifications.notifyUsers(userIds, type, title, body, RESOURCE, fileId);
    }
}
