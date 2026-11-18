package com.manageedocs.identity.controller;

import com.manageedocs.common.dto.PagedResponse;
import com.manageedocs.common.dto.StandardAPIResponse;
import com.manageedocs.identity.dto.UserDtos.CreateUserRequest;
import com.manageedocs.identity.dto.UserDtos.PermissionOverridesRequest;
import com.manageedocs.identity.dto.UserDtos.UpdateUserRequest;
import com.manageedocs.identity.dto.UserDtos.UserView;
import com.manageedocs.identity.service.UserAdminService;
import com.manageedocs.security.CurrentUser;
import com.manageedocs.security.Permission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Tag(name = "Users")
@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    private final UserAdminService users;

    public UserController(UserAdminService users) {
        this.users = users;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('TENANT_USERS_VIEW')")
    public StandardAPIResponse<PagedResponse<UserView>> list(@RequestParam(defaultValue = "0") int page,
                                                            @RequestParam(defaultValue = "25") int size) {
        return StandardAPIResponse.success(users.list(page, size), "Users retrieved");
    }

    @PostMapping
    @PreAuthorize("hasAuthority('TENANT_USERS_MANAGE')")
    public ResponseEntity<StandardAPIResponse<UserView>> create(@Valid @RequestBody CreateUserRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(StandardAPIResponse.success(users.create(CurrentUser.get(), req), "User created"));
    }

    @Operation(summary = "Change role / activate / deactivate. Takes effect immediately (existing sessions end).")
    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('TENANT_USERS_MANAGE')")
    public StandardAPIResponse<UserView> update(@PathVariable UUID id, @Valid @RequestBody UpdateUserRequest req) {
        return StandardAPIResponse.success(users.update(CurrentUser.get(), id, req), "User updated");
    }

    @PutMapping("/{id}/permissions")
    @PreAuthorize("hasAuthority('TENANT_USERS_MANAGE')")
    public StandardAPIResponse<Void> setPermissions(@PathVariable UUID id, @RequestBody PermissionOverridesRequest req) {
        users.setOverrides(CurrentUser.get(), id, req);
        return StandardAPIResponse.success("Permissions updated");
    }

    @Operation(summary = "The capability catalog (for permission editors)")
    @GetMapping("/permission-catalog")
    @PreAuthorize("hasAuthority('TENANT_USERS_VIEW')")
    public StandardAPIResponse<List<Map<String, String>>> catalog() {
        return StandardAPIResponse.success(Arrays.stream(Permission.values()).filter(p -> !p.isPlatformLevel())
                .map(p -> Map.of("name", p.name(), "code", p.getCode())).toList(), "Catalog retrieved");
    }
}
