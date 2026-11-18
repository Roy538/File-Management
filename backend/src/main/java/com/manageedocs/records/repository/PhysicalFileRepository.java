package com.manageedocs.records.repository;

import com.manageedocs.records.model.PhysicalFile;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PhysicalFileRepository extends JpaRepository<PhysicalFile, UUID> {

    /** Row lock for every status change: two clerks cannot dispatch the same file at once. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select f from PhysicalFile f where f.id = :id")
    Optional<PhysicalFile> lockById(@Param("id") UUID id);

    boolean existsByFileNumberAndVolumeNumber(String fileNumber, int volumeNumber);

    /** {@code q} matches file number or customer name (pass null for no text filter). */
    @Query("""
            select f from PhysicalFile f
            where (:q is null or lower(f.fileNumber) like :q or lower(f.customerName) like :q)
              and (:status is null or f.status = :status)
              and (:departmentId is null or f.departmentId = :departmentId)
            """)
    Page<PhysicalFile> search(@Param("q") String q, @Param("status") PhysicalFile.Status status,
                              @Param("departmentId") UUID departmentId, Pageable pageable);

    List<PhysicalFile> findByStatusOrderByFileNumberAsc(PhysicalFile.Status status);

    @Query("select f.status, count(f) from PhysicalFile f group by f.status")
    List<Object[]> countByStatus();

    @Query("select f.departmentId, f.status, count(f) from PhysicalFile f group by f.departmentId, f.status")
    List<Object[]> countByDepartmentAndStatus();
}
