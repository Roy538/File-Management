package com.manageedocs.dashboard.controller;

import com.manageedocs.common.dto.StandardAPIResponse;
import com.manageedocs.dashboard.dto.DashboardDtos.Dashboard;
import com.manageedocs.dashboard.service.DashboardService;
import com.manageedocs.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Dashboard")
@RestController
@RequestMapping("/api/v1/dashboard")
public class DashboardController {

    private final DashboardService dashboard;

    public DashboardController(DashboardService dashboard) {
        this.dashboard = dashboard;
    }

    @Operation(summary = "Home-page figures, limited to what the caller may see")
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public StandardAPIResponse<Dashboard> get() {
        return StandardAPIResponse.success(dashboard.forCaller(CurrentUser.get()), "Dashboard retrieved");
    }
}
