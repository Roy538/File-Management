package com.manageedocs.records.repository;

import com.manageedocs.records.model.FileMovement;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface FileMovementRepository extends JpaRepository<FileMovement, UUID> {

    List<FileMovement> findByFileIdOrderByOccurredAtDesc(UUID fileId);

    List<FileMovement> findByFileIdAndOccurredAtGreaterThanEqualAndOccurredAtLessThanOrderByOccurredAtAsc(
            UUID fileId, Instant from, Instant to);

    /** Most recent movement of a given kind, e.g. when a missing file was flagged. */
    FileMovement findFirstByFileIdAndActionOrderByOccurredAtDesc(UUID fileId, FileMovement.Action action);
}
