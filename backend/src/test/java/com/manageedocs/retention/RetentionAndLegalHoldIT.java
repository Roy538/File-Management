package com.manageedocs.retention;

import com.manageedocs.audit.model.AuditEvent;
import com.manageedocs.audit.repository.AuditEventRepository;
import com.manageedocs.audit.service.AuditService;
import com.manageedocs.processing.service.ProcessingWorker;
import com.manageedocs.support.ApiClient;
import com.manageedocs.support.MySqlIntegrationTest;
import com.manageedocs.tenancy.TenantContext;
import com.manageedocs.tenancy.model.Tenant;
import com.manageedocs.tenancy.service.TenantProvisioningService;
import com.manageedocs.tenancy.service.TenantProvisioningService.AdminSpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import static com.manageedocs.support.ApiClient.fetch;
import static com.manageedocs.support.ApiClient.read;
import static org.assertj.core.api.Assertions.assertThat;

/** Directive scenario G: retention deadline → policy evaluation → legal-hold check → archival or disposal. */
class RetentionAndLegalHoldIT extends MySqlIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired TenantProvisioningService provisioning;
    @Autowired ProcessingWorker worker;
    @Autowired AuditEventRepository auditEvents;
    @Autowired AuditService audit;
    @Autowired TransactionTemplate tx;

    private ApiClient api;
    private Tenant alpha;
    private String admin;
    private String officer;

    @BeforeEach
    void setUp() throws Exception {
        api = new ApiClient(mvc);
        String suffix = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        alpha = provisioning.provision("R" + suffix, "Alpha Ltd", new AdminSpec("admin@alpha.test", ApiClient.PASSWORD, "Rita", "Records"));
        admin = api.login(alpha.getCode(), "admin@alpha.test");
        api.createUser(admin, "officer@alpha.test", "OFFICER");
        officer = api.login(alpha.getCode(), "officer@alpha.test");
    }

    @Test
    void dueDocumentsAreArchivedOrDestroyedOnlyAsPoliciesHoldsAndApprovalAllow() throws Exception {
        // Policies: contracts are archived (type-level), the scratch cabinet is destroyed (cabinet-level).
        String archivePolicy = policy("Archive contracts", "ARCHIVE");
        String destroyPolicy = policy("Purge scratch", "DESTROY");
        String contractType = read(api.call(admin, HttpMethod.POST, "/api/v1/document-types",
                "{\"name\":\"Contract\"}", 201), "$.data.id");
        api.call(admin, HttpMethod.PUT, "/api/v1/retention/document-types/" + contractType + "/policy",
                "{\"policyId\":\"" + archivePolicy + "\"}", 200);
        String scratchCab = api.cabinet(admin, "Scratch", "DEFAULT");
        api.call(admin, HttpMethod.PUT, "/api/v1/retention/cabinets/" + scratchCab + "/policy",
                "{\"policyId\":\"" + destroyPolicy + "\"}", 200);
        String scratch = api.folder(admin, scratchCab, "Drafts");
        String legal = api.folder(admin, api.cabinet(admin, "Legal", "DEFAULT"), "Agreements");

        String contract = api.uploadTyped(officer, legal, "msa.pdf", pdf("msa"), contractType);
        String contractInScratch = api.uploadTyped(officer, scratch, "nda.pdf", pdf("nda"), contractType); // type wins
        String draftA = api.uploadId(officer, scratch, "draft-a.pdf", pdf("draft a"));
        String draftHeldEarly = api.uploadId(officer, scratch, "draft-b.pdf", pdf("draft b"));
        String draftHeldLate = api.uploadId(officer, scratch, "draft-c.pdf", pdf("draft c"));
        worker.drain();
        String draftAUrl = read(api.call(admin, HttpMethod.GET, "/api/v1/documents/" + draftA + "/content-url", null, 200), "$.data.url");

        // A legal hold placed before evaluation.
        String hold = read(api.call(admin, HttpMethod.POST, "/api/v1/legal-holds",
                "{\"name\":\"Smith v. Alpha\",\"reason\":\"Pending litigation\",\"matterRef\":\"HC-2026-117\"}", 201), "$.data.id");
        api.call(admin, HttpMethod.POST, "/api/v1/legal-holds/" + hold + "/documents",
                "{\"documentIds\":[\"" + draftHeldEarly + "\"]}", 200);

        // Officers cannot run retention.
        api.call(officer, HttpMethod.POST, "/api/v1/retention/evaluate", null, 403);

        MvcResult eval = api.call(admin, HttpMethod.POST, "/api/v1/retention/evaluate", null, 200);
        assertThat((Integer) read(eval, "$.data.archived")).isEqualTo(2);
        assertThat((Integer) read(eval, "$.data.proposedForDestruction")).isEqualTo(2);   // draftA + draftHeldLate
        assertThat((Integer) read(eval, "$.data.skippedUnderHold")).isEqualTo(1);
        String runId = read(eval, "$.data.proposedRunId");

        // Archived = read-only but still retrievable, and type policy beat the cabinet's DESTROY policy.
        for (String id : List.of(contract, contractInScratch)) {
            assertThat((String) read(api.call(officer, HttpMethod.GET, "/api/v1/documents/" + id, null, 200), "$.data.status")).isEqualTo("ARCHIVED");
        }
        assertThat((String) read(api.call(officer, HttpMethod.POST, "/api/v1/documents/" + contract + "/checkout", null, 409), "$.code")).isEqualTo("ARCHIVED");
        api.call(officer, HttpMethod.GET, "/api/v1/documents/" + contract + "/content-url", null, 200);

        // Nothing is destroyed until a records manager approves — and a hold placed meanwhile still wins.
        api.call(officer, HttpMethod.GET, "/api/v1/documents/" + draftA, null, 200);
        api.call(admin, HttpMethod.POST, "/api/v1/legal-holds/" + hold + "/documents",
                "{\"documentIds\":[\"" + draftHeldLate + "\"]}", 200);
        MvcResult executed = api.call(admin, HttpMethod.POST, "/api/v1/retention/runs/" + runId + "/approve", "{}", 200);
        assertThat((String) read(executed, "$.data.status")).isEqualTo("EXECUTED");
        List<String> outcomes = read(executed, "$.data.items[*].outcome");
        assertThat(outcomes).containsExactlyInAnyOrder("DESTROYED", "SKIPPED_HOLD");
        api.call(admin, HttpMethod.POST, "/api/v1/retention/runs/" + runId + "/approve", "{}", 409);   // decided once

        // Destroyed: gone from the API and its bytes are purged from storage.
        api.call(admin, HttpMethod.GET, "/api/v1/documents/" + draftA, null, 404);
        assertThat(ApiClient.httpStatus(draftAUrl)).isEqualTo(404);
        // Held documents survive, and cannot be deleted by hand either…
        api.call(admin, HttpMethod.GET, "/api/v1/documents/" + draftHeldLate, null, 200);
        assertThat((String) read(api.call(admin, HttpMethod.DELETE, "/api/v1/documents/" + draftHeldEarly, null, 409), "$.code")).isEqualTo("LEGAL_HOLD");
        assertThat((Boolean) read(api.call(admin, HttpMethod.GET, "/api/v1/documents/" + draftHeldEarly, null, 200), "$.data.onLegalHold")).isTrue();
        // …until the hold is released (with a reason).
        api.call(admin, HttpMethod.POST, "/api/v1/legal-holds/" + hold + "/release", "{\"reason\":\"Case settled\"}", 200);
        api.call(admin, HttpMethod.DELETE, "/api/v1/documents/" + draftHeldEarly, null, 200);

        // The destruction is evidenced: who, what, which policy, and each version's SHA-256.
        List<AuditEvent> events = TenantContext.callAs(alpha.getId(), () -> tx.execute(s -> auditEvents.findAllByOrderBySeqAsc()));
        assertThat(events).anySatisfy(e -> {
            assertThat(e.getAction()).isEqualTo("DOCUMENT_DESTROYED");
            assertThat(e.getResourceId()).isEqualTo(draftA);
            assertThat(e.getDetails()).contains("Purge scratch").containsPattern("1:[0-9a-f]{64}");
        });
        assertThat(events).extracting(AuditEvent::getAction)
                .contains("DOCUMENT_ARCHIVED", "DISPOSITION_PROPOSED", "DISPOSITION_EXECUTED", "LEGAL_HOLD_RELEASED");
        TenantContext.runAs(alpha.getId(), () -> assertThat(audit.verifyChain()).isEqualTo(-1));
    }

    @Test
    void cancelledRunsDestroyNothingAndHoldsCanCoverAWholeFolder() throws Exception {
        String destroyPolicy = policy("Purge temp", "DESTROY");
        String cab = api.cabinet(admin, "Temp", "DEFAULT");
        api.call(admin, HttpMethod.PUT, "/api/v1/retention/cabinets/" + cab + "/policy", "{\"policyId\":\"" + destroyPolicy + "\"}", 200);
        String folder = api.folder(admin, cab, "Batch");
        String a = api.uploadId(officer, folder, "a.pdf", pdf("a"));
        String b = api.uploadId(officer, folder, "b.pdf", pdf("b"));

        String runId = read(api.call(admin, HttpMethod.POST, "/api/v1/retention/evaluate", null, 200), "$.data.proposedRunId");
        api.call(admin, HttpMethod.POST, "/api/v1/retention/runs/" + runId + "/cancel", null, 200);
        api.call(officer, HttpMethod.GET, "/api/v1/documents/" + a, null, 200);

        // A folder-level hold covers every document in the subtree; nothing is proposed while it is active.
        String hold = read(api.call(admin, HttpMethod.POST, "/api/v1/legal-holds", "{\"name\":\"Audit 2026\",\"reason\":\"External audit\"}", 201), "$.data.id");
        MvcResult held = api.call(admin, HttpMethod.POST, "/api/v1/legal-holds/" + hold + "/documents", "{\"folderId\":\"" + folder + "\"}", 200);
        List<String> heldIds = read(held, "$.data.documents[*].documentId");
        assertThat(heldIds).containsExactlyInAnyOrder(a, b);
        MvcResult eval = api.call(admin, HttpMethod.POST, "/api/v1/retention/evaluate", null, 200);
        assertThat((Integer) read(eval, "$.data.proposedForDestruction")).isZero();
        assertThat((Integer) read(eval, "$.data.skippedUnderHold")).isEqualTo(2);
        List<String> due = read(api.call(admin, HttpMethod.GET, "/api/v1/retention/due?withinDays=0", null, 200), "$.data[*].documentId");
        assertThat(due).contains(a, b);
    }

    private String policy(String name, String action) throws Exception {
        return read(api.call(admin, HttpMethod.POST, "/api/v1/retention/policies",
                "{\"name\":\"" + name + "\",\"retainFor\":\"P0D\",\"trigger\":\"CREATED\",\"action\":\"" + action + "\"}", 201), "$.data.id");
    }

    private static byte[] pdf(String body) {
        return ("%PDF-1.7\n" + body + "\n%%EOF").getBytes(StandardCharsets.US_ASCII);
    }
}
