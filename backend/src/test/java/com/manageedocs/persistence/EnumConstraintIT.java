package com.manageedocs.persistence;

import com.manageedocs.audit.model.AuditOutcome;
import com.manageedocs.documents.model.Document;
import com.manageedocs.documents.model.DocumentVersion;
import com.manageedocs.identity.model.Role;
import com.manageedocs.identity.model.UserPermission;
import com.manageedocs.permissions.model.AclEntry;
import com.manageedocs.support.MySqlIntegrationTest;
import com.manageedocs.taxonomy.model.Cabinet;
import com.manageedocs.taxonomy.model.MetadataField;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Arrays;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Hibernate's {@code validate} compares column types, not the values a CHECK constraint accepts.
 * Adding a Java enum member without a migration passes every other test and then fails on the
 * first insert in production. This test reads each constraint from MySQL and requires every enum
 * constant to appear in it (the reference platform's hard-won lesson, applied here).
 */
class EnumConstraintIT extends MySqlIntegrationTest {

    @Autowired JdbcTemplate jdbc;

    private static final Map<String, Class<? extends Enum<?>>> CONSTRAINTS = Map.of(
            "ck_user_role", Role.class,
            "ck_audit_outcome", AuditOutcome.class,
            "ck_cabinet_visibility", Cabinet.Visibility.class,
            "ck_metadata_field_type", MetadataField.DataType.class,
            "ck_acl_resource", AclEntry.ResourceType.class,
            "ck_document_status", Document.Status.class,
            "ck_document_version_status", DocumentVersion.ProcessingStatus.class,
            "ck_user_permission_effect", UserPermission.Effect.class);

    @Test
    void everyEnumConstantIsAcceptedByItsCheckConstraint() {
        CONSTRAINTS.forEach((name, type) -> {
            String clause = jdbc.queryForObject(
                    "select check_clause from information_schema.check_constraints"
                            + " where constraint_schema = database() and constraint_name = ?",
                    String.class, name);
            // MySQL reports the clause with escaped quotes and charset introducers, e.g. _utf8mb4\'X\'.
            String normalised = clause == null ? null : clause.replace("\\'", "'");
            assertThat(normalised).as("constraint %s exists", name).isNotNull();
            Arrays.stream(type.getEnumConstants()).map(Enum::name).forEach(v ->
                    assertThat(normalised).as("%s accepts %s.%s", name, type.getSimpleName(), v)
                            .contains(quote(v)));
        });
    }

    private static String quote(String v) {
        return "'" + v + "'";
    }
}
