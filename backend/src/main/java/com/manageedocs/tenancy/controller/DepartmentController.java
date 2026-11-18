package com.manageedocs.tenancy.controller;

import com.manageedocs.common.dto.StandardAPIResponse;
import com.manageedocs.security.CurrentUser;
import com.manageedocs.tenancy.dto.DepartmentDtos.CreateDepartmentRequest;
import com.manageedocs.tenancy.dto.DepartmentDtos.DepartmentView;
import com.manageedocs.tenancy.service.DepartmentService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "Departments")
@RestController
@RequestMapping("/api/v1/departments")
public class DepartmentController {

    private final DepartmentService departments;

    public DepartmentController(DepartmentService departments) {
        this.departments = departments;
    }

    /** Names only; every signed-in member of the organisation may pick a department. */
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public StandardAPIResponse<List<DepartmentView>> list() {
        return StandardAPIResponse.success(departments.list(), "Departments retrieved");
    }

    @PostMapping
    @PreAuthorize("hasAuthority('TENANT_SETTINGS_MANAGE')")
    public ResponseEntity<StandardAPIResponse<DepartmentView>> create(@Valid @RequestBody CreateDepartmentRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(StandardAPIResponse.success(departments.create(CurrentUser.get(), req), "Department created"));
    }
}
