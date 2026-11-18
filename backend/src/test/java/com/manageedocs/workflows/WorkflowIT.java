package com.manageedocs.workflows;

import com.manageedocs.processing.service.ProcessingWorker;
import com.manageedocs.support.ApiClient;
import com.manageedocs.support.MySqlIntegrationTest;
import com.manageedocs.tenancy.TenantContext;
import com.manageedocs.tenancy.model.Tenant;
import com.manageedocs.tenancy.service.TenantProvisioningService;
import com.manageedocs.tenancy.service.TenantProvisioningService.AdminSpec;
import com.manageedocs.workflows.service.WorkflowEngine;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import static com.manageedocs.support.ApiClient.read;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Directive scenario E: submit → assign → review → approve/reject, with status and history kept correct. */
class WorkflowIT extends MySqlIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired TenantProvisioningService provisioning;
    @Autowired ProcessingWorker worker;
    @Autowired WorkflowEngine engine;

    private ApiClient api;
    private Tenant alpha;
    private String admin, author, officerB, dept1, dept2, betaAdmin;
    private String adminId, officerBId, dept1Id;
    private String folder;

    @BeforeEach
    void setUp() throws Exception {
        api = new ApiClient(mvc);
        String suffix = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        alpha = provisioning.provision("W" + suffix, "Alpha Ltd", new AdminSpec("admin@alpha.test", ApiClient.PASSWORD, "Ann", "Admin"));
        Tenant beta = provisioning.provision("X" + suffix, "Beta Ltd", new AdminSpec("admin@beta.test", ApiClient.PASSWORD, "Ben", "Admin"));
        admin = api.login(alpha.getCode(), "admin@alpha.test");
        adminId = read(api.call(admin, HttpMethod.GET, "/api/v1/auth/me", null, 200), "$.data.id");
        betaAdmin = api.login(beta.getCode(), "admin@beta.test");
        api.createUser(admin, "author@alpha.test", "OFFICER");
        officerBId = api.createUser(admin, "officer.b@alpha.test", "OFFICER");
        dept1Id = api.createUser(admin, "dept1@alpha.test", "DEPT_USER");
        api.createUser(admin, "dept2@alpha.test", "DEPT_USER");
        author = api.login(alpha.getCode(), "author@alpha.test");
        officerB = api.login(alpha.getCode(), "officer.b@alpha.test");
        dept1 = api.login(alpha.getCode(), "dept1@alpha.test");
        dept2 = api.login(alpha.getCode(), "dept2@alpha.test");
        folder = api.folder(admin, api.cabinet(admin, "Policies", "DEFAULT"), "HR");
    }

    @Test
    void fullReviewLifecycleWithChangesEscalationDelegationApprovalAndPublication() throws Exception {
        String wf = definition("Policy approval", """
                [{"name":"Department review","approvalMode":"ANY","assigneeRole":"DEPT_USER","dueDays":0},
                 {"name":"Final sign-off","approvalMode":"ALL","assigneeUserIds":["%s","%s"]}]
                """.formatted(officerBId, adminId));
        String doc = api.uploadId(author, folder, "leave-policy.pdf", pdf("v1"));
        worker.drain();

        // Submit: document frozen while under review.
        MvcResult submitted = api.call(author, HttpMethod.POST, "/api/v1/documents/" + doc + "/reviews",
                "{\"definitionId\":\"" + wf + "\",\"comment\":\"Please review\"}", 201);
        String review = read(submitted, "$.data.id");
        assertThat((String) read(api.call(author, HttpMethod.GET, "/api/v1/documents/" + doc, null, 200), "$.data.status")).isEqualTo("UNDER_REVIEW");
        assertThat((String) read(uploadVersion(author, doc, 409), "$.code")).isEqualTo("UNDER_REVIEW");
        api.call(author, HttpMethod.POST, "/api/v1/documents/" + doc + "/reviews", "{\"definitionId\":\"" + wf + "\"}", 409);   // one at a time

        // Step 1 goes to every DEPT_USER, who are notified.
        String task1 = onlyTask(dept1);
        assertThat(unread(dept1)).isGreaterThanOrEqualTo(1);
        api.call(author, HttpMethod.POST, "/api/v1/tasks/" + task1 + "/decision", "{\"decision\":\"APPROVE\"}", 403);   // not assigned
        api.call(dept1, HttpMethod.POST, "/api/v1/tasks/" + task1 + "/decision", "{\"decision\":\"REQUEST_CHANGES\"}", 400); // reason required

        // Changes requested → back to the author, who must upload a new version before resubmitting.
        api.call(dept1, HttpMethod.POST, "/api/v1/tasks/" + task1 + "/decision",
                "{\"decision\":\"REQUEST_CHANGES\",\"comment\":\"Clarify carry-over rules\"}", 200);
        assertThat((String) read(api.call(author, HttpMethod.GET, "/api/v1/reviews/" + review, null, 200), "$.data.status")).isEqualTo("CHANGES_REQUESTED");
        assertThat((String) read(api.call(author, HttpMethod.GET, "/api/v1/documents/" + doc, null, 200), "$.data.status")).isEqualTo("DRAFT");
        assertThat(notificationTypes(author)).contains("WORKFLOW_CHANGES_REQUESTED");
        assertThat((String) read(api.call(author, HttpMethod.POST, "/api/v1/reviews/" + review + "/resubmit", "{}", 409), "$.code")).isEqualTo("NO_NEW_VERSION");
        uploadVersion(author, doc, 201);
        worker.drain();
        MvcResult resubmitted = api.call(author, HttpMethod.POST, "/api/v1/reviews/" + review + "/resubmit", "{\"comment\":\"Clarified\"}", 200);
        assertThat((Integer) read(resubmitted, "$.data.documentVersionNo")).isEqualTo(2);

        // Overdue (due 0 days) → escalated once to assignees and administrators.
        assertThat(TenantContext.callAs(alpha.getId(), engine::escalateOverdue)).isEqualTo(1);
        assertThat(TenantContext.callAs(alpha.getId(), engine::escalateOverdue)).isZero();
        assertThat(notificationTypes(admin)).contains("WORKFLOW_TASK_ESCALATED");

        // Step 1 approved by another department user → step 2 (ALL: officer B and the admin).
        api.call(dept2, HttpMethod.POST, "/api/v1/tasks/" + onlyTask(dept2) + "/decision", "{\"decision\":\"APPROVE\"}", 200);
        api.call(officerB, HttpMethod.POST, "/api/v1/tasks/" + onlyTask(officerB) + "/decision", "{\"decision\":\"APPROVE\"}", 200);
        assertThat((String) read(api.call(author, HttpMethod.GET, "/api/v1/reviews/" + review, null, 200), "$.data.status"))
                .as("ALL: one of two approvals is not enough").isEqualTo("IN_PROGRESS");
        // The admin delegates their sign-off to a colleague, who completes the review.
        api.call(admin, HttpMethod.POST, "/api/v1/tasks/" + onlyTask(admin) + "/delegate",
                "{\"toUserId\":\"" + dept1Id + "\",\"comment\":\"On leave\"}", 200);
        api.call(dept1, HttpMethod.POST, "/api/v1/tasks/" + onlyTask(dept1) + "/decision", "{\"decision\":\"APPROVE\"}", 200);

        MvcResult done = api.call(author, HttpMethod.GET, "/api/v1/reviews/" + review, null, 200);
        assertThat((String) read(done, "$.data.status")).isEqualTo("APPROVED");
        List<String> history = read(done, "$.data.history[*].action");
        assertThat(history).containsSubsequence("SUBMITTED", "CHANGES_REQUESTED", "RESUBMITTED", "ESCALATED",
                "STEP_COMPLETED", "DELEGATED", "COMPLETED");
        assertThat(notificationTypes(author)).contains("WORKFLOW_APPROVED");
        assertThat((String) read(api.call(author, HttpMethod.GET, "/api/v1/documents/" + doc, null, 200), "$.data.status")).isEqualTo("APPROVED");

        api.call(author, HttpMethod.POST, "/api/v1/documents/" + doc + "/publish", null, 200);
        assertThat((String) read(api.call(dept2, HttpMethod.GET, "/api/v1/documents/" + doc, null, 200), "$.data.status")).isEqualTo("PUBLISHED");
    }

    @Test
    void submittersNeverApproveTheirOwnWorkAndRunningReviewsKeepTheirDefinitionVersion() throws Exception {
        // Admin is the only ADMIN: a step assigned to ADMIN has no eligible reviewer when the admin submits.
        String adminsOnly = definition("Admin sign-off", "[{\"name\":\"Sign\",\"approvalMode\":\"ANY\",\"assigneeRole\":\"ADMIN\"}]");
        String doc = api.uploadId(admin, folder, "a.pdf", pdf("a"));
        assertThat((String) read(api.call(admin, HttpMethod.POST, "/api/v1/documents/" + doc + "/reviews",
                "{\"definitionId\":\"" + adminsOnly + "\"}", 409), "$.code")).isEqualTo("NO_ELIGIBLE_REVIEWER");
        String withSelf = definition("Pair sign-off", """
                [{"name":"Both","approvalMode":"ALL","assigneeUserIds":["%s","%s"]}]""".formatted(adminId, officerBId));
        assertThat((String) read(api.call(admin, HttpMethod.POST, "/api/v1/documents/" + doc + "/reviews",
                "{\"definitionId\":\"" + withSelf + "\"}", 409), "$.code")).isEqualTo("SELF_APPROVAL");
        assertThat((String) read(api.call(admin, HttpMethod.GET, "/api/v1/documents/" + doc, null, 200), "$.data.status"))
                .as("a refused submission changes nothing").isEqualTo("DRAFT");

        // Definition versioning: revise while a review runs; the running review keeps version 1.
        String wf = definition("Quick review", "[{\"name\":\"Check\",\"approvalMode\":\"ANY\",\"assigneeRole\":\"DEPT_USER\"}]");
        String d1 = api.uploadId(author, folder, "one.pdf", pdf("one"));
        String r1 = read(api.call(author, HttpMethod.POST, "/api/v1/documents/" + d1 + "/reviews", "{\"definitionId\":\"" + wf + "\"}", 201), "$.data.id");
        api.call(admin, HttpMethod.PUT, "/api/v1/workflows/" + wf, """
                {"name":"Quick review","steps":[{"name":"Check","approvalMode":"ANY","assigneeRole":"DEPT_USER"},
                                                {"name":"Officer","approvalMode":"ANY","assigneeRole":"OFFICER"}]}""", 200);
        String d2 = api.uploadId(author, folder, "two.pdf", pdf("two"));
        MvcResult r2 = api.call(author, HttpMethod.POST, "/api/v1/documents/" + d2 + "/reviews", "{\"definitionId\":\"" + wf + "\"}", 201);
        assertThat((Integer) read(api.call(author, HttpMethod.GET, "/api/v1/reviews/" + r1, null, 200), "$.data.definitionVersionNo")).isEqualTo(1);
        assertThat((Integer) read(r2, "$.data.definitionVersionNo")).isEqualTo(2);

        // Single-step v1 review: one approval completes it. Reject the other: terminal, document back to draft.
        String t1 = taskFor(dept1, d1);
        api.call(dept1, HttpMethod.POST, "/api/v1/tasks/" + t1 + "/decision", "{\"decision\":\"APPROVE\"}", 200);
        assertThat((String) read(api.call(author, HttpMethod.GET, "/api/v1/reviews/" + r1, null, 200), "$.data.status")).isEqualTo("APPROVED");
        String t2 = taskFor(dept1, d2);
        api.call(dept1, HttpMethod.POST, "/api/v1/tasks/" + t2 + "/decision", "{\"decision\":\"REJECT\",\"comment\":\"Out of scope\"}", 200);
        assertThat((String) read(api.call(author, HttpMethod.GET, "/api/v1/documents/" + d2, null, 200), "$.data.status")).isEqualTo("DRAFT");
        api.call(dept1, HttpMethod.POST, "/api/v1/tasks/" + t2 + "/decision", "{\"decision\":\"APPROVE\"}", 409);   // already decided

        // Another organisation cannot see or act on any of it.
        api.call(betaAdmin, HttpMethod.GET, "/api/v1/reviews/" + r1, null, 404);
        api.call(betaAdmin, HttpMethod.POST, "/api/v1/tasks/" + t2 + "/decision", "{\"decision\":\"APPROVE\"}", 404);
        api.call(betaAdmin, HttpMethod.GET, "/api/v1/workflows/" + wf, null, 404);
        // Inboxes are private.
        String someoneElses = read(api.call(author, HttpMethod.GET, "/api/v1/notifications", null, 200), "$.data.content[0].id");
        api.call(dept1, HttpMethod.POST, "/api/v1/notifications/" + someoneElses + "/read", null, 404);
    }

    private String definition(String name, String stepsJson) throws Exception {
        return read(api.call(admin, HttpMethod.POST, "/api/v1/workflows",
                "{\"name\":\"" + name + "\",\"steps\":" + stepsJson + "}", 201), "$.data.id");
    }

    private String onlyTask(String token) throws Exception {
        List<String> ids = read(api.call(token, HttpMethod.GET, "/api/v1/tasks", null, 200), "$.data[*].id");
        assertThat(ids).hasSize(1);
        return ids.get(0);
    }

    private String taskFor(String token, String documentId) throws Exception {
        List<String> ids = read(api.call(token, HttpMethod.GET, "/api/v1/tasks", null, 200),
                "$.data[?(@.documentId == '" + documentId + "')].id");
        assertThat(ids).hasSize(1);
        return ids.get(0);
    }

    private long unread(String token) throws Exception {
        Number n = read(api.call(token, HttpMethod.GET, "/api/v1/notifications/unread-count", null, 200), "$.data.unread");
        return n.longValue();
    }

    private List<String> notificationTypes(String token) throws Exception {
        return read(api.call(token, HttpMethod.GET, "/api/v1/notifications?size=50", null, 200), "$.data.content[*].type");
    }

    private MvcResult uploadVersion(String token, String docId, int expected) throws Exception {
        return mvc.perform(multipart("/api/v1/documents/" + docId + "/versions")
                        .file(new MockMultipartFile("file", "v.pdf", "application/pdf", pdf("v" + UUID.randomUUID())))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().is(expected)).andReturn();
    }

    private static byte[] pdf(String body) {
        return ("%PDF-1.7\n" + body + "\n%%EOF").getBytes(StandardCharsets.US_ASCII);
    }
}
