package com.manageedocs.identity.repository;

import com.manageedocs.identity.model.UserPermission;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface UserPermissionRepository extends JpaRepository<UserPermission, UserPermission.Key> {

    @Query("select p from UserPermission p where p.id.userId = :userId")
    List<UserPermission> findForUser(@Param("userId") UUID userId);
}
