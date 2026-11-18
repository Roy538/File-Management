package com.manageedocs.documents;

import com.jayway.jsonpath.JsonPath;
import com.manageedocs.audit.model.AuditEvent;
import com.manageedocs.audit.repository.AuditEventRepository;
import com.manageedocs.audit.service.AuditService;
import com.manageedocs.support.MySqlIntegrationTest;
import com.manageedocs.tenancy.TenantContext;
import com.manageedocs.tenancy.model.Tenant;
import com.manageedocs.tenancy.service.TenantProvisioningService;
import com.manageedocs.tenancy.service.TenantProvisioningService.AdminSpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.support.TransactionTemplate;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Directive acceptance scenarios A (upload), B (retrieval), C (access control), D (versioning) and
 * F (multi-tenancy) at the API level, against real MySQL and real MinIO.
 */
class DocumentFlowIT extends MySqlIntegrationTest {

    private static final String PW = "Correct-Horse-2026!";
    private static final byte[] PDF_V1 = "%PDF-1.7\nversion one body\n%%EOF".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] PDF_V2 = "%PDF-1.7\nversion two body, longer\n%%EOF".getBytes(StandardCharsets.US_ASCII);

    @Autowired MockMvc mvc;
    @Autowired TenantProvisioningService provisioning;
    @Autowired AuditEventRepository auditEvents;
    @Autowired AuditService audit;
    @Autowired TransactionTemplate tx;
    @Autowired com.manageedocs.processing.service.ProcessingWorker worker;

    private Tenant alpha;
    private String admin;      // ADMIN of Alpha
    private String officerA;   // OFFICER of Alpha
    private String officerB;   // second OFFICER of Alpha
    private String deptUser;   // DEPT_USER of Alpha
    private String officerBId;
    private String betaAdmin;  // ADMIN of a different organisation

    @BeforeEach
    void setUp() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        alpha = provisioning.provision("A" + suffix, "Alpha Ltd", new AdminSpec("admin@alpha.test", PW, "Ann", "Admin"));
        Tenant beta = provisioning.provision("B" + suffix, "Beta Ltd", new AdminSpec("admin@beta.test", PW, "Ben", "Admin"));
        admin = login(alpha.getCode(), "admin@alpha.test");
        betaAdmin = login(beta.getCode(), "admin@beta.test");
        createUser(admin, "officer.a@alpha.test", "OFFICER");
        officerBId = createUser(admin, "officer.b@alpha.test", "OFFICER");
        createUser(admin, "dept@alpha.test", "DEPT_USER");
        officerA = login(alpha.getCode(), "officer.a@alpha.test");
        officerB = login(alpha.getCode(), "officer.b@alpha.test");
        deptUser = login(alpha.getCode(), "dept@alpha.test");
    }

    // ── Scenario A + B: upload, retrieve, download the exact bytes ────────────────

    @Test
    void uploadStoresValidatedContentAndDownloadReturnsTheSameBytes() throws Exception {
        String folder = defaultCabinetFolder("HR Employee Files", "Adrianne Gorie");
        MvcResult up = upload(officerA, folder, "Offer Letter.PDF", PDF_V1, null, 201);
        String docId = read(up, "$.data.document.id");
        assertThat((String) read(up, "$.data.document.title")).isEqualTo("Offer Letter");
        assertThat((Integer) read(up, "$.data.document.currentVersionNo")).isEqualTo(1);
        assertThat((String) read(up, "$.data.document.versions[0].contentType")).isEqualTo("application/pdf");
        assertThat((String) read(up, "$.data.document.versions[0].fileName")).isEqualTo("Offer Letter.pdf");
        assertThat((String) read(up, "$.data.document.versions[0].sha256")).hasSize(64);

        // Listing (scenario B) and the exact bytes back through a short-lived presigned link.
        MvcResult list = call(officerA, HttpMethod.GET, "/api/v1/documents?folderId=" + folder + "&q=offer", null, 200);
        assertThat((Integer) read(list, "$.data.totalElements")).isEqualTo(1);
        assertThat(fetch(contentUrl(deptUser, docId, null))).isEqualTo(PDF_V1);

        auditActions(alpha).containsSubsequence("DOCUMENT_UPLOADED", "DOCUMENT_DOWNLOADED");
    }

    @Test
    void spoofedOrDisallowedFilesAreRejectedAndNothingIsStored() throws Exception {
        String folder = defaultCabinetFolder("Finance", "Invoices");
        byte[] exe = {'M', 'Z', (byte) 0x90, 0, 3, 0};
        assertThat((String) read(upload(officerA, folder, "invoice.pdf", exe, null, 400), "$.code")).isEqualTo("FILE_CONTENT_MISMATCH");
        assertThat((String) read(upload(officerA, folder, "tool.exe", exe, null, 400), "$.code")).isEqualTo("FILE_TYPE_NOT_ALLOWED");
        MvcResult list = call(officerA, HttpMethod.GET, "/api/v1/documents?folderId=" + folder, null, 200);
        assertThat((Integer) read(list, "$.data.totalElements")).isZero();
    }

    @Test
    void duplicateContentIsFlaggedOnUpload() throws Exception {
        String folder = defaultCabinetFolder("Policies", "2026");
        String first = read(upload(officerA, folder, "policy.pdf", PDF_V1, null, 201), "$.data.document.id");
        List<String> dups = read(upload(officerA, folder, "policy-copy.pdf", PDF_V1, null, 201), "$.data.possibleDuplicates");
        assertThat(dups).containsExactly(first);
    }

    // ── Capability layer: department users read but cannot upload ────────────────

    @Test
    void departmentUsersCanReadButNotUpload() throws Exception {
        String folder = defaultCabinetFolder("Company Policies", "HR");
        String docId = read(upload(officerA, folder, "handbook.pdf", PDF_V1, null, 201), "$.data.document.id");
        call(deptUser, HttpMethod.GET, "/api/v1/documents/" + docId, null, 200);
        upload(deptUser, folder, "mine.pdf", PDF_V1, null, 403);
        call(deptUser, HttpMethod.DELETE, "/api/v1/documents/" + docId, null, 403);
    }

    // ── Scenario C: private cabinets, sharing, 404 not 403 ────────────────────────

    @Test
    void privateCabinetIsInvisibleUntilSharedAndSharingIsScoped() throws Exception {
        String cab = read(call(officerA, HttpMethod.POST, "/api/v1/cabinets",
                "{\"name\":\"Board Minutes\",\"visibility\":\"PRIVATE\"}", 201), "$.data.id");
        String folder = read(call(officerA, HttpMethod.POST, "/api/v1/cabinets/" + cab + "/folders",
                "{\"name\":\"2026\"}", 201), "$.data.id");
        String docId = read(upload(officerA, folder, "minutes.pdf", PDF_V1, null, 201), "$.data.document.id");

        // Another officer cannot see it at all — and cannot tell it exists.
        assertThat((String) read(call(officerB, HttpMethod.GET, "/api/v1/documents/" + docId, null, 404), "$.code")).isEqualTo("NOT_FOUND");
        call(officerB, HttpMethod.GET, "/api/v1/cabinets/" + cab, null, 404);
        call(officerB, HttpMethod.GET, "/api/v1/documents/" + docId + "/content-url", null, 404);
        List<String> visible = read(call(officerB, HttpMethod.GET, "/api/v1/cabinets", null, 200), "$.data[*].id");
        assertThat(visible).doesNotContain(cab);

        // The admin (records oversight) grants Officer B read access to just that document.
        call(admin, HttpMethod.POST, "/api/v1/access/documents/" + docId,
                "{\"userId\":\"" + officerBId + "\",\"rights\":[\"VIEW\",\"DOWNLOAD\"]}", 201);
        call(officerB, HttpMethod.GET, "/api/v1/documents/" + docId, null, 200);
        assertThat(fetch(contentUrl(officerB, docId, null))).isEqualTo(PDF_V1);
        // ...but not to edit it, and not to the rest of the cabinet.
        call(officerB, HttpMethod.POST, "/api/v1/documents/" + docId + "/checkout", null, 403);
        List<String> rights = read(call(officerB, HttpMethod.GET, "/api/v1/documents/" + docId, null, 200), "$.data.rights");
        assertThat(rights).containsExactlyInAnyOrder("view", "download");
        List<String> shared = read(call(officerB, HttpMethod.GET, "/api/v1/cabinets", null, 200), "$.data[*].id");
        assertThat(shared).contains(cab);   // discoverable because something inside is shared

        // Officers lack ACCESS_MANAGE, so they cannot share at all (capability layer).
        call(officerA, HttpMethod.POST, "/api/v1/access/documents/" + docId,
                "{\"role\":\"DEPT_USER\",\"rights\":[\"VIEW\"]}", 403);
        // Every refused attempt was recorded as a security event against the right actor and object.
        List<AuditEvent> denials = TenantContext.callAs(alpha.getId(), () -> tx.execute(st ->
                auditEvents.findAllByOrderBySeqAsc().stream().filter(e -> e.getAction().equals("ACCESS_DENIED")).toList()));
        assertThat(denials).anySatisfy(e -> {
            assertThat(e.getActorId().toString()).isEqualTo(officerBId);
            assertThat(e.getResourceType()).isEqualTo("DOCUMENT");
            assertThat(e.getResourceId()).isEqualTo(docId);
            assertThat(e.getOutcome()).isEqualTo(com.manageedocs.audit.model.AuditOutcome.DENIED);
        });
        assertThat(denials).anySatisfy(e -> assertThat(e.getResourceType()).isEqualTo("CABINET"));
        TenantContext.runAs(alpha.getId(), () -> assertThat(audit.verifyChain()).isEqualTo(-1));
    }

    // ── Scenario D: versioning, restore, check-out locking ────────────────────────

    @Test
    void versionsAreImmutableRestorableAndProtectedByCheckOut() throws Exception {
        String folder = defaultCabinetFolder("Contracts", "Vendor A");
        String docId = read(upload(officerA, folder, "contract.pdf", PDF_V1, null, 201), "$.data.document.id");

        // New version; v1 is preserved byte-for-byte.
        MvcResult v2 = uploadVersion(officerA, docId, "contract.pdf", PDF_V2, "comment=Signed+copy", 201);
        assertThat((Integer) read(v2, "$.data.currentVersionNo")).isEqualTo(2);
        assertThat(fetch(contentUrl(officerA, docId, 1))).isEqualTo(PDF_V1);
        assertThat(fetch(contentUrl(officerA, docId, 2))).isEqualTo(PDF_V2);

        // Stale writer is told someone else added a version.
        assertThat((String) read(uploadVersion(officerB, docId, "contract.pdf", PDF_V1, "expectedCurrentVersionNo=1", 409), "$.code"))
                .isEqualTo("VERSION_CONFLICT");

        // Restore v1 creates v3 (no history rewrite).
        MvcResult restored = call(officerA, HttpMethod.POST, "/api/v1/documents/" + docId + "/versions/1/restore", "{}", 200);
        assertThat((Integer) read(restored, "$.data.currentVersionNo")).isEqualTo(3);
        assertThat((Integer) read(restored, "$.data.versions[0].restoredFromNo")).isEqualTo(1);
        assertThat(fetch(contentUrl(officerA, docId, 3))).isEqualTo(PDF_V1);

        // Check-out blocks other editors; only the holder or an admin override releases it.
        call(officerA, HttpMethod.POST, "/api/v1/documents/" + docId + "/checkout", null, 200);
        assertThat((String) read(uploadVersion(officerB, docId, "x.pdf", PDF_V2, null, 409), "$.code")).isEqualTo("DOCUMENT_LOCKED");
        call(officerB, HttpMethod.POST, "/api/v1/documents/" + docId + "/release", null, 403);
        call(admin, HttpMethod.POST, "/api/v1/documents/" + docId + "/release", null, 200);
        uploadVersion(officerB, docId, "x.pdf", PDF_V2, null, 201);

        auditActions(alpha).contains("DOCUMENT_VERSION_CREATED", "DOCUMENT_VERSION_RESTORED", "DOCUMENT_CHECKED_OUT",
                "DOCUMENT_LOCK_OVERRIDDEN");
    }

    @Test
    void staleEditsAreRejectedRatherThanOverwritingSomeoneElsesChange() throws Exception {
        String folder = defaultCabinetFolder("Projects", "Apollo");
        MvcResult up = upload(officerA, folder, "plan.pdf", PDF_V1, null, 201);
        String docId = read(up, "$.data.document.id");
        Integer entityVersion = read(up, "$.data.document.entityVersion");
        call(officerA, HttpMethod.PUT, "/api/v1/documents/" + docId,
                "{\"title\":\"Plan A\",\"entityVersion\":" + entityVersion + "}", 200);
        assertThat((String) read(call(officerB, HttpMethod.PUT, "/api/v1/documents/" + docId,
                "{\"title\":\"Plan B\",\"entityVersion\":" + entityVersion + "}", 409), "$.code")).isEqualTo("CONCURRENT_MODIFICATION");
    }

    // ── Metadata schemas ──────────────────────────────────────────────────────────

    @Test
    void metadataIsValidatedAgainstTheDocumentTypeSchema() throws Exception {
        String typeId = read(call(admin, HttpMethod.POST, "/api/v1/document-types", """
                {"name":"Offer Letter","fields":[
                  {"key":"employee_no","label":"Employee No","dataType":"TEXT","required":true},
                  {"key":"start_date","label":"Start date","dataType":"DATE","required":false},
                  {"key":"grade","label":"Grade","dataType":"ENUM","required":false,"allowedValues":["G1","G2"]}]}
                """, 201), "$.data.id");
        String folder = defaultCabinetFolder("HR", "Offers");
        MvcResult bad = upload(officerA, folder, "offer.pdf", PDF_V1,
                new String[]{typeId, "{\"start_date\":\"not-a-date\",\"grade\":\"G9\"}"}, 400);
        assertThat((String) read(bad, "$.code")).isEqualTo("VALIDATION_FAILED");
        assertThat((String) read(bad, "$.errors.employee_no")).contains("required");
        assertThat((String) read(bad, "$.errors.start_date")).contains("date");
        assertThat((String) read(bad, "$.errors.grade")).contains("one of");

        MvcResult ok = upload(officerA, folder, "offer.pdf", PDF_V1,
                new String[]{typeId, "{\"employee_no\":\"E-1042\",\"start_date\":\"2026-12-01\",\"grade\":\"G2\"}"}, 201);
        List<String> values = read(ok, "$.data.document.metadata[*].value");
        assertThat(values).containsExactly("E-1042", "2026-12-01", "G2");
    }

    // ── Structure: folder moves and guarded deletes ───────────────────────────────

    @Test
    void foldersMoveAcrossCabinetsWithTheirDocumentsAndCannotMoveIntoThemselves() throws Exception {
        String cabA = cabinet(admin, "Customers");
        String cabB = cabinet(admin, "Archive");
        String parent = folder(admin, cabA, null, "Acme");
        String child = folder(admin, cabA, parent, "Loans");
        String docId = read(upload(officerA, child, "loan.pdf", PDF_V1, null, 201), "$.data.document.id");

        assertThat((String) read(call(admin, HttpMethod.POST, "/api/v1/folders/" + parent + "/move",
                "{\"targetParentId\":\"" + child + "\"}", 400), "$.code")).isEqualTo("INVALID_MOVE");
        call(admin, HttpMethod.POST, "/api/v1/folders/" + parent + "/move", "{\"targetCabinetId\":\"" + cabB + "\"}", 200);
        assertThat((String) read(call(officerA, HttpMethod.GET, "/api/v1/documents/" + docId, null, 200), "$.data.cabinetId")).isEqualTo(cabB);
        List<String> treeB = read(call(admin, HttpMethod.GET, "/api/v1/cabinets/" + cabB, null, 200), "$.data.folders[*].id");
        assertThat(treeB).containsExactlyInAnyOrder(parent, child);

        assertThat((String) read(call(admin, HttpMethod.DELETE, "/api/v1/folders/" + child, null, 409), "$.code")).isEqualTo("FOLDER_NOT_EMPTY");
        call(admin, HttpMethod.DELETE, "/api/v1/documents/" + docId, null, 200);
        call(admin, HttpMethod.DELETE, "/api/v1/folders/" + child, null, 200);
        call(officerA, HttpMethod.GET, "/api/v1/documents/" + docId, null, 404);
    }

    // ── Scenario F: another organisation sees nothing ─────────────────────────────

    @Test
    void anotherOrganisationCannotReachDocumentsFoldersOrCabinets() throws Exception {
        String cab = cabinet(admin, "Legal");
        String folder = folder(admin, cab, null, "Matter 17");
        String docId = read(upload(officerA, folder, "brief.pdf", PDF_V1, null, 201), "$.data.document.id");

        call(betaAdmin, HttpMethod.GET, "/api/v1/documents/" + docId, null, 404);
        call(betaAdmin, HttpMethod.GET, "/api/v1/documents/" + docId + "/content-url", null, 404);
        call(betaAdmin, HttpMethod.GET, "/api/v1/documents?folderId=" + folder, null, 404);
        call(betaAdmin, HttpMethod.GET, "/api/v1/cabinets/" + cab, null, 404);
        call(betaAdmin, HttpMethod.DELETE, "/api/v1/documents/" + docId, null, 404);
        upload(betaAdmin, folder, "intrude.pdf", PDF_V1, null, 404);
        List<String> betaCabinets = read(call(betaAdmin, HttpMethod.GET, "/api/v1/cabinets", null, 200), "$.data[*].id");
        assertThat(betaCabinets).doesNotContain(cab);
        // Alpha's document is untouched and its audit chain intact.
        call(admin, HttpMethod.GET, "/api/v1/documents/" + docId, null, 200);
        TenantContext.runAs(alpha.getId(), () -> assertThat(audit.verifyChain()).isEqualTo(-1));
    }

    // ── Revocation: deactivation and capability changes take effect on the very next request ──

    @Test
    void deactivatingAUserEndsTheirSessionImmediately() throws Exception {
        call(officerB, HttpMethod.GET, "/api/v1/auth/me", null, 200);
        call(admin, HttpMethod.PUT, "/api/v1/users/" + officerBId, "{\"role\":\"OFFICER\",\"active\":false}", 200);
        call(officerB, HttpMethod.GET, "/api/v1/auth/me", null, 401);   // same unexpired token, now refused
        mvc.perform(request(HttpMethod.POST, "/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"organisation\":\"%s\",\"email\":\"officer.b@alpha.test\",\"password\":\"%s\"}"
                                .formatted(alpha.getCode(), PW)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void denyingACapabilityRemovesItEvenWhereRightsWouldAllow() throws Exception {
        String folder = defaultCabinetFolder("Ops", "Runbooks");
        String docId = read(upload(officerA, folder, "runbook.pdf", PDF_V1, null, 201), "$.data.document.id");
        call(admin, HttpMethod.PUT, "/api/v1/users/" + officerBId + "/permissions", "{\"deny\":[\"DOCUMENTS_DOWNLOAD\"]}", 200);
        call(officerB, HttpMethod.GET, "/api/v1/auth/me", null, 401);    // old token revoked by the change
        String fresh = login(alpha.getCode(), "officer.b@alpha.test");
        call(fresh, HttpMethod.GET, "/api/v1/documents/" + docId + "/content-url", null, 403);
        List<String> rights = read(call(fresh, HttpMethod.GET, "/api/v1/documents/" + docId, null, 200), "$.data.rights");
        assertThat(rights).contains("view").doesNotContain("download");
        // Platform capabilities can never be handed to organisation users.
        call(admin, HttpMethod.PUT, "/api/v1/users/" + officerBId + "/permissions", "{\"grant\":[\"PLATFORM_VIEW_ALL\"]}", 400);
    }

    // ── helpers ───────────────────────────────────────────────────────────────────

    private String login(String org, String email) throws Exception {
        MvcResult r = mvc.perform(request(HttpMethod.POST, "/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"organisation\":\"%s\",\"email\":\"%s\",\"password\":\"%s\"}".formatted(org, email, PW)))
                .andExpect(status().isOk()).andReturn();
        return read(r, "$.data.accessToken");
    }

    private String createUser(String token, String email, String role) throws Exception {
        return read(call(token, HttpMethod.POST, "/api/v1/users", """
                {"email":"%s","firstName":"Test","lastName":"%s","role":"%s","temporaryPassword":"%s"}
                """.formatted(email, role, role, PW), 201), "$.data.id");
    }

    private String cabinet(String token, String name) throws Exception {
        return read(call(token, HttpMethod.POST, "/api/v1/cabinets",
                "{\"name\":\"" + name + "\",\"visibility\":\"DEFAULT\"}", 201), "$.data.id");
    }

    private String folder(String token, String cabinetId, String parentId, String name) throws Exception {
        String body = parentId == null ? "{\"name\":\"" + name + "\"}" : "{\"name\":\"" + name + "\",\"parentId\":\"" + parentId + "\"}";
        return read(call(token, HttpMethod.POST, "/api/v1/cabinets/" + cabinetId + "/folders", body, 201), "$.data.id");
    }

    private String defaultCabinetFolder(String cabinetName, String folderName) throws Exception {
        return folder(admin, cabinet(admin, cabinetName), null, folderName);
    }

    private MvcResult call(String token, HttpMethod method, String path, String json, int expected) throws Exception {
        MockHttpServletRequestBuilder req = request(method, path).header("Authorization", "Bearer " + token);
        if (json != null) req.contentType(MediaType.APPLICATION_JSON).content(json);
        return mvc.perform(req).andExpect(status().is(expected)).andReturn();
    }

    /** @param typeAndMetadata optional {documentTypeId, metadataJson} */
    private MvcResult upload(String token, String folderId, String name, byte[] bytes, String[] typeAndMetadata,
                             int expected) throws Exception {
        var req = multipart("/api/v1/documents")
                .file(new MockMultipartFile("file", name, "application/octet-stream", bytes))
                .param("folderId", folderId)
                .header("Authorization", "Bearer " + token);
        if (typeAndMetadata != null) {
            req.param("documentTypeId", typeAndMetadata[0]);
            req.file(new MockMultipartFile("metadata", "", MediaType.APPLICATION_JSON_VALUE,
                    typeAndMetadata[1].getBytes(StandardCharsets.UTF_8)));
        }
        return mvc.perform(req).andExpect(status().is(expected)).andReturn();
    }

    private MvcResult uploadVersion(String token, String docId, String name, byte[] bytes, String query, int expected) throws Exception {
        var req = multipart("/api/v1/documents/" + docId + "/versions" + (query == null ? "" : "?" + query))
                .file(new MockMultipartFile("file", name, "application/pdf", bytes))
                .header("Authorization", "Bearer " + token);
        return mvc.perform(req).andExpect(status().is(expected)).andReturn();
    }

    private String contentUrl(String token, String docId, Integer version) throws Exception {
        worker.drain();   // binaries become downloadable only after the security scan
        return read(call(token, HttpMethod.GET, "/api/v1/documents/" + docId + "/content-url"
                + (version == null ? "" : "?version=" + version), null, 200), "$.data.url");
    }

    private static byte[] fetch(String url) throws Exception {
        HttpResponse<byte[]> r = HttpClient.newHttpClient()
                .send(HttpRequest.newBuilder(URI.create(url)).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
        assertThat(r.statusCode()).isEqualTo(200);
        return r.body();
    }

    private org.assertj.core.api.ListAssert<String> auditActions(Tenant tenant) {
        List<String> actions = TenantContext.callAs(tenant.getId(), () -> tx.execute(s ->
                auditEvents.findAllByOrderBySeqAsc().stream().map(AuditEvent::getAction).toList()));
        return assertThat(actions);
    }

    @SuppressWarnings("unchecked")
    private static <T> T read(MvcResult r, String path) throws Exception {
        return (T) JsonPath.read(r.getResponse().getContentAsString(), path);
    }
}
