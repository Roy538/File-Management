package com.manageedocs.taxonomy.model;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FolderTest {

    private final UUID cab = UUID.randomUUID();
    private final UUID otherCab = UUID.randomUUID();

    @Test
    void pathAndLineageDescribeTheAncestorChain() {
        Folder root = Folder.root(cab, "Customers");
        Folder child = Folder.childOf(root, "Acme");
        Folder grandchild = Folder.childOf(child, "Loans");
        assertThat(grandchild.getDepth()).isEqualTo(3);
        assertThat(grandchild.lineage()).containsExactly(root.getId(), child.getId(), grandchild.getId());
        assertThat(root.contains(grandchild)).isTrue();
        assertThat(grandchild.contains(root)).isFalse();
    }

    @Test
    void movingRebasesDescendantsIntoTheNewCabinet() {
        Folder root = Folder.root(cab, "Customers");
        Folder child = Folder.childOf(root, "Acme");
        Folder grandchild = Folder.childOf(child, "Loans");
        Folder target = Folder.root(otherCab, "Archive");

        String oldPrefix = child.moveTo(otherCab, target);
        grandchild.rebase(oldPrefix, child);

        assertThat(child.getCabinetId()).isEqualTo(otherCab);
        assertThat(grandchild.getCabinetId()).isEqualTo(otherCab);
        assertThat(grandchild.lineage()).containsExactly(target.getId(), child.getId(), grandchild.getId());
        assertThat(grandchild.getDepth()).isEqualTo(3);
    }

    @Test
    void depthIsBounded() {
        Folder f = Folder.root(cab, "L1");
        for (int i = 2; i <= Folder.MAX_DEPTH; i++) f = Folder.childOf(f, "L" + i);
        Folder deepest = f;
        assertThatThrownBy(() -> Folder.childOf(deepest, "too deep")).isInstanceOf(IllegalArgumentException.class);
    }
}
