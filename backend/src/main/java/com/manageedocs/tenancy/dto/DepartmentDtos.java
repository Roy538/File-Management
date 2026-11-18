package com.manageedocs.tenancy.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public final class DepartmentDtos {

    private DepartmentDtos() {
    }

    public record DepartmentView(UUID id, String code, String name, boolean active) {
    }

    public record CreateDepartmentRequest(
            @NotBlank @Size(max = 32) @Pattern(regexp = "[A-Za-z0-9_-]+", message = "use letters, digits, _ and - only") String code,
            @NotBlank @Size(max = 200) String name) {
    }
}
