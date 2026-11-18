package com.manageedocs.notifications.controller;

import com.manageedocs.common.dto.PagedResponse;
import com.manageedocs.common.dto.StandardAPIResponse;
import com.manageedocs.notifications.service.NotificationService;
import com.manageedocs.notifications.service.NotificationService.NotificationView;
import com.manageedocs.security.CurrentUser;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/** The caller's own inbox; nobody can read or change another user's notifications. */
@Tag(name = "Notifications")
@RestController
@RequestMapping("/api/v1/notifications")
@PreAuthorize("isAuthenticated()")
public class NotificationController {

    private final NotificationService notifications;

    public NotificationController(NotificationService notifications) {
        this.notifications = notifications;
    }

    @GetMapping
    public StandardAPIResponse<PagedResponse<NotificationView>> inbox(@RequestParam(defaultValue = "false") boolean unreadOnly,
                                                                     @RequestParam(defaultValue = "0") int page,
                                                                     @RequestParam(defaultValue = "20") int size) {
        return StandardAPIResponse.success(notifications.inbox(CurrentUser.get(), unreadOnly, page, size), "Notifications retrieved");
    }

    @GetMapping("/unread-count")
    public StandardAPIResponse<Map<String, Long>> unread() {
        return StandardAPIResponse.success(Map.of("unread", notifications.unreadCount(CurrentUser.get())), "Unread count");
    }

    @PostMapping("/{id}/read")
    public StandardAPIResponse<Void> read(@PathVariable UUID id) {
        notifications.markRead(CurrentUser.get(), id);
        return StandardAPIResponse.success("Marked as read");
    }

    @PostMapping("/read-all")
    public StandardAPIResponse<Map<String, Integer>> readAll() {
        return StandardAPIResponse.success(Map.of("marked", notifications.markAllRead(CurrentUser.get())), "All marked as read");
    }
}
