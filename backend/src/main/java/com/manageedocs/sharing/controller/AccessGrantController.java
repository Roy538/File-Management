package com.manageedocs.sharing.controller;

import com.manageedocs.common.dto.StandardAPIResponse;
import com.manageedocs.permissions.model.AclEntry;
import com.manageedocs.security.CurrentUser;
import com.manageedocs.sharing.dto.GrantDtos.GrantRequest;
import com.manageedocs.sharing.dto.GrantDtos.GrantView;
import com.manageedocs.sharing.service.AccessGrantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Tag(name = "Access grants")
@RestController
@RequestMapping("/api/v1/access")
public class AccessGrantController {

    private final AccessGrantService grants;

    public AccessGrantController(AccessGrantService grants) {
        this.grants = grants;
    }

    @Operation(summary = "Grants on a cabinet, folder or document (resourceType: cabinets | folders | documents)")
    @GetMapping("/{resourceType}/{resourceId}")
    @PreAuthorize("hasAuthority('ACCESS_MANAGE')")
    public StandardAPIResponse<List<GrantView>> list(@PathVariable String resourceType, @PathVariable UUID resourceId) {
        return StandardAPIResponse.success(grants.list(CurrentUser.get(), type(resourceType), resourceId), "Grants retrieved");
    }

    @PostMapping("/{resourceType}/{resourceId}")
    @PreAuthorize("hasAuthority('ACCESS_MANAGE')")
    public ResponseEntity<StandardAPIResponse<GrantView>> grant(@PathVariable String resourceType, @PathVariable UUID resourceId,
                                                                @Valid @RequestBody GrantRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(StandardAPIResponse.success(
                grants.grant(CurrentUser.get(), type(resourceType), resourceId, req), "Access granted"));
    }

    @DeleteMapping("/grants/{grantId}")
    @PreAuthorize("hasAuthority('ACCESS_MANAGE')")
    public StandardAPIResponse<Void> revoke(@PathVariable UUID grantId) {
        grants.revoke(CurrentUser.get(), grantId);
        return StandardAPIResponse.success("Access revoked");
    }

    private static AclEntry.ResourceType type(String plural) {
        return switch (plural.toLowerCase(Locale.ROOT)) {
            case "cabinets" -> AclEntry.ResourceType.CABINET;
            case "folders" -> AclEntry.ResourceType.FOLDER;
            case "documents" -> AclEntry.ResourceType.DOCUMENT;
            default -> throw new IllegalArgumentException("Unknown resource type: use cabinets, folders or documents");
        };
    }
}
