package com.manageedocs.records.model;

import com.manageedocs.records.model.PhysicalFile.Status;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PhysicalFileTest {

    @Test
    void followsTheLegacyLifecycleExactly() {
        assertThat(PhysicalFile.canMove(Status.AVAILABLE, Status.DISPATCHED)).isTrue();
        assertThat(PhysicalFile.canMove(Status.DISPATCHED, Status.RETURNED)).isTrue();
        assertThat(PhysicalFile.canMove(Status.RETURNED, Status.AVAILABLE)).isTrue();
        assertThat(PhysicalFile.canMove(Status.ARCHIVED, Status.AVAILABLE)).isTrue();
        assertThat(PhysicalFile.canMove(Status.MISSING, Status.ARCHIVED)).isTrue();
        // Never: lend a returned file before it is shelved, archive a file that is out, or skip the return.
        assertThat(PhysicalFile.canMove(Status.RETURNED, Status.DISPATCHED)).isFalse();
        assertThat(PhysicalFile.canMove(Status.DISPATCHED, Status.ARCHIVED)).isFalse();
        assertThat(PhysicalFile.canMove(Status.DISPATCHED, Status.AVAILABLE)).isFalse();
        assertThat(PhysicalFile.canMove(Status.ARCHIVED, Status.DISPATCHED)).isFalse();
        for (Status s : Status.values()) assertThat(PhysicalFile.canMove(s, s)).as("%s to itself", s).isFalse();
    }

    @Test
    void refusesAnIllegalMoveAndKeepsItsState() {
        PhysicalFile f = new PhysicalFile(" ln/1 ", " Jane ", null, LocalDate.of(2025, 1, 1), 1, "Shelf A");
        assertThat(f.getFileNumber()).isEqualTo("LN/1");
        assertThat(f.getCurrentLocation()).isEqualTo("Shelf A");
        f.moveTo(Status.DISPATCHED, "Credit");
        assertThatThrownBy(() -> f.moveTo(Status.ARCHIVED, null)).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("dispatched");
        assertThat(f.getStatus()).isEqualTo(Status.DISPATCHED);
        assertThat(f.getCurrentLocation()).isEqualTo("Credit");
    }

    @Test
    void aLoanIsReturnedOnlyOnceAndKnowsWhenItIsOverdue() {
        FileDispatch d = new FileDispatch(null, null, null, "Mary", "Credit", null, java.time.Instant.EPOCH,
                LocalDate.of(2026, 3, 10), null);
        assertThat(d.isOverdue(LocalDate.of(2026, 3, 10))).isFalse();
        assertThat(d.isOverdue(LocalDate.of(2026, 3, 11))).isTrue();
        d.recordReturn(null, "Mary", FileDispatch.Condition.GOOD, true, "Shelf", null, java.time.Instant.EPOCH);
        assertThat(d.isOverdue(LocalDate.of(2026, 3, 11))).isFalse();
        assertThatThrownBy(() -> d.recordReturn(null, "Mary", FileDispatch.Condition.GOOD, true, null, null, java.time.Instant.EPOCH))
                .isInstanceOf(IllegalStateException.class);
    }
}
