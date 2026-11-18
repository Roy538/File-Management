package com.manageedocs.records.repository;

import com.manageedocs.records.model.FileRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface FileRequestRepository extends JpaRepository<FileRequest, UUID> {

    /** {@code requestedBy} null = everyone's requests (registry staff); otherwise only that person's. */
    @Query("""
            select r from FileRequest r
            where (:status is null or r.status = :status)
              and (:requestedBy is null or r.requestedBy = :requestedBy)
            order by r.createdAt desc
            """)
    Page<FileRequest> search(@Param("status") FileRequest.Status status, @Param("requestedBy") UUID requestedBy,
                             Pageable pageable);

    List<FileRequest> findByFileIdAndStatusIn(UUID fileId, List<FileRequest.Status> statuses);

    long countByStatus(FileRequest.Status status);
}
