package com.manageedocs.retention.repository;

import com.manageedocs.retention.model.DispositionItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface DispositionItemRepository extends JpaRepository<DispositionItem, UUID> {

    List<DispositionItem> findByRunIdOrderByDueAtAsc(UUID runId);
}
