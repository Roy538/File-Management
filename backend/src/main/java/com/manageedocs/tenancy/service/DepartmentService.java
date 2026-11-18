package com.manageedocs.tenancy.service;

import com.manageedocs.audit.service.AuditService;
import com.manageedocs.exception.ApiException;
import com.manageedocs.security.AppUserDetails;
import com.manageedocs.tenancy.dto.DepartmentDtos.CreateDepartmentRequest;
import com.manageedocs.tenancy.dto.DepartmentDtos.DepartmentView;
import com.manageedocs.tenancy.model.Department;
import com.manageedocs.tenancy.repository.DepartmentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/** Departments / branches of the organisation (legacy "Branch"); used to file and report on records. */
@Service
public class DepartmentService {

    private final DepartmentRepository departments;
    private final AuditService audit;

    public DepartmentService(DepartmentRepository departments, AuditService audit) {
        this.departments = departments;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<DepartmentView> list() {
        return departments.findAllByOrderByNameAsc().stream().map(DepartmentService::view).toList();
    }

    @Transactional
    public DepartmentView create(AppUserDetails caller, CreateDepartmentRequest req) {
        String code = req.code().trim().toUpperCase();
        if (departments.existsByCode(code)) throw ApiException.conflict("DEPARTMENT_CODE_TAKEN", "Code " + code + " is already used");
        Department d = departments.save(new Department(code, req.name()));
        audit.success(caller, "DEPARTMENT_CREATED", "DEPARTMENT", d.getId(), Map.of("code", code, "name", d.getName()));
        return view(d);
    }

    private static DepartmentView view(Department d) {
        return new DepartmentView(d.getId(), d.getCode(), d.getName(), d.isActive());
    }
}
