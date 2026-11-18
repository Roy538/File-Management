package com.manageedocs.retention.repository;

import com.manageedocs.retention.model.DispositionRun;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DispositionRunRepository extends JpaRepository<DispositionRun, UUID> {

    List<DispositionRun> findAllByOrderByProposedAtDesc();

    Optional<DispositionRun> findFirstByStatus(DispositionRun.Status status);
}
