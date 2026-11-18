package com.manageedocs.records.repository;

import com.manageedocs.records.model.FileDispatch;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FileDispatchRepository extends JpaRepository<FileDispatch, UUID> {

    Optional<FileDispatch> findFirstByFileIdAndReturnedAtIsNull(UUID fileId);

    List<FileDispatch> findByFileIdOrderByDispatchedAtDesc(UUID fileId);

    List<FileDispatch> findByReturnedAtIsNullOrderByDispatchedAtAsc();

    List<FileDispatch> findByDispatchedAtGreaterThanEqualAndDispatchedAtLessThanOrderByDispatchedAtAsc(Instant from, Instant to);

    List<FileDispatch> findByReturnedAtGreaterThanEqualAndReturnedAtLessThanOrderByReturnedAtAsc(Instant from, Instant to);

    long countByReturnedAtIsNull();

    long countByDispatchedAtGreaterThanEqualAndDispatchedAtLessThan(Instant from, Instant to);

    long countByReturnedAtGreaterThanEqualAndReturnedAtLessThan(Instant from, Instant to);

    @Query("""
            select count(d) from FileDispatch d
            where d.returnedAt is null and d.expectedReturnOn is not null and d.expectedReturnOn < :today
            """)
    long countOverdue(@Param("today") LocalDate today);

    /** Overdue loans not yet announced today. */
    @Query("""
            select d from FileDispatch d
            where d.returnedAt is null and d.expectedReturnOn is not null and d.expectedReturnOn < :today
              and (d.overdueNotifiedOn is null or d.overdueNotifiedOn < :today)
            """)
    List<FileDispatch> findOverdueToNotify(@Param("today") LocalDate today);
}
