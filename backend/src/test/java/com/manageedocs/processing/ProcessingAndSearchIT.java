package com.manageedocs.processing;

import com.manageedocs.audit.model.AuditEvent;
import com.manageedocs.audit.repository.AuditEventRepository;
import com.manageedocs.processing.model.ProcessingJob;
import com.manageedocs.processing.repository.ProcessingJobRepository;
import com.manageedocs.processing.service.ProcessingWorker;
import com.manageedocs.storage.OrphanObjectSweeper;
import com.manageedocs.storage.StoragePort;
import com.manageedocs.support.ApiClient;
import com.manageedocs.support.FakeMalwareScanner;
import com.manageedocs.support.MySqlIntegrationTest;
import com.manageedocs.tenancy.TenantContext;
import com.manageedocs.tenancy.model.Tenant;
import com.manageedocs.tenancy.service.TenantProvisioningService;
import com.manageedocs.tenancy.service.TenantProvisioningService.AdminSpec;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static com.manageedocs.support.ApiClient.fetch;
import static com.manageedocs.support.ApiClient.read;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pipeline (scan → extract → index), directive scenario H (processing failure + retry without
 * corrupting the document), and permission-filtered full-text search.
 */
class ProcessingAndSearchIT extends MySqlIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired TenantProvisioningService provisioning;
    @Autowired ProcessingWorker worker;
    @Autowired ProcessingJobRepository jobs;
    @Autowired AuditEventRepository auditEvents;
    @Autowired OrphanObjectSweeper sweeper;
    @Autowired StoragePort storage;
    @Autowired TransactionTemplate tx;

    private ApiClient api;
    private Tenant alpha;
    private String admin;
    private String officerA;
    private String officerB;
    private String officerBId;
    private String betaAdmin;

    @BeforeEach
    void setUp() throws Exception {
        api = new ApiClient(mvc);
        String suffix = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        alpha = provisioning.provision("A" + suffix, "Alpha Ltd", new AdminSpec("admin@alpha.test", ApiClient.PASSWORD, "Ann", "Admin"));
        Tenant beta = provisioning.provision("B" + suffix, "Beta Ltd", new AdminSpec("admin@beta.test", ApiClient.PASSWORD, "Ben", "Admin"));
        admin = api.login(alpha.getCode(), "admin@alpha.test");
        betaAdmin = api.login(beta.getCode(), "admin@beta.test");
        api.createUser(admin, "officer.a@alpha.test", "OFFICER");
        officerBId = api.createUser(admin, "officer.b@alpha.test", "OFFICER");
        officerA = api.login(alpha.getCode(), "officer.a@alpha.test");
        officerB = api.login(alpha.getCode(), "officer.b@alpha.test");
    }

    @AfterEach
    void resetScanner() {
        FakeMalwareScanner.failNextScans(0);
    }

    @Test
    void uploadedPdfIsScannedExtractedAndFoundByItsContent() throws Exception {
        String folder = api.folder(admin, api.cabinet(admin, "HR Employee Files", "DEFAULT"), "Wanjiku Kamau");
        byte[] pdf = pdf("Confidential employment agreement between Riverlong and Wanjiku Kamau, effective January 2027.");
        String docId = api.uploadId(officerA, folder, "Contract.pdf", pdf);

        // Not downloadable until scanned.
        assertThat((String) read(api.call(officerA, HttpMethod.GET, "/api/v1/documents/" + docId + "/content-url", null, 409), "$.code"))
                .isEqualTo("PROCESSING");
        assertThat(worker.drain()).isPositive();

        MvcResult detail = api.call(officerA, HttpMethod.GET, "/api/v1/documents/" + docId, null, 200);
        assertThat((String) read(detail, "$.data.versions[0].processingStatus")).isEqualTo("AVAILABLE");
        MvcResult history = api.call(officerA, HttpMethod.GET, "/api/v1/documents/" + docId + "/processing", null, 200);
        assertThat((String) read(history, "$.data[0].scanResult")).isEqualTo("CLEAN");
        assertThat((Integer) read(history, "$.data[0].extractedChars")).isGreaterThan(40);
        assertThat(fetch(read(api.call(officerA, HttpMethod.GET, "/api/v1/documents/" + docId + "/content-url", null, 200), "$.data.url")))
                .isEqualTo(pdf);

        // A word that appears only in the body, never in the title.
        MvcResult found = api.call(officerA, HttpMethod.GET, "/api/v1/search?q=employment+agreement", null, 200);
        assertThat((Integer) read(found, "$.data.results.totalElements")).isEqualTo(1);
        assertThat((String) read(found, "$.data.results.content[0].id")).isEqualTo(docId);
        assertThat((Boolean) read(found, "$.data.results.content[0].matchedContent")).isTrue();
        String snippet = read(found, "$.data.results.content[0].snippet.text");
        List<List<Integer>> marks = read(found, "$.data.results.content[0].snippet.highlights");
        assertThat(snippet).containsIgnoringCase("employment");
        assertThat(snippet.substring(marks.get(0).get(0), marks.get(0).get(1))).isEqualToIgnoringCase("employment");
        assertThat((String) read(found, "$.data.results.content[0].cabinetName")).isEqualTo("HR Employee Files");
        assertThat((Integer) read(found, "$.data.facets.cabinet[0].count")).isEqualTo(1);

        // Prefix matching and title search.
        assertThat((Integer) read(api.call(officerA, HttpMethod.GET, "/api/v1/search?q=employ", null, 200), "$.data.results.totalElements")).isEqualTo(1);
        assertThat((Integer) read(api.call(officerA, HttpMethod.GET, "/api/v1/search?q=contract", null, 200), "$.data.results.totalElements")).isEqualTo(1);
        assertThat((Integer) read(api.call(officerA, HttpMethod.GET, "/api/v1/search?q=nonexistentword", null, 200), "$.data.results.totalElements")).isZero();
    }

    @Test
    void searchNeverRevealsDocumentsTheCallerCannotSee() throws Exception {
        String privateCab = api.cabinet(officerA, "Board Minutes", "PRIVATE");
        String folder = api.folder(officerA, privateCab, "2027");
        String docId = api.uploadId(officerA, folder, "minutes.pdf", pdf("Strategic acquisition of Zebra Holdings discussed."));
        worker.drain();

        assertThat((Integer) read(api.call(officerA, HttpMethod.GET, "/api/v1/search?q=acquisition", null, 200), "$.data.results.totalElements")).isEqualTo(1);
        // Same organisation, no access: not in results, counts or facets.
        MvcResult hidden = api.call(officerB, HttpMethod.GET, "/api/v1/search?q=acquisition", null, 200);
        assertThat((Integer) read(hidden, "$.data.results.totalElements")).isZero();
        assertThat(hidden.getResponse().getContentAsString()).doesNotContain("Zebra").doesNotContain("Board Minutes");
        // Another organisation: nothing, even for its administrator.
        assertThat((Integer) read(api.call(betaAdmin, HttpMethod.GET, "/api/v1/search?q=acquisition", null, 200), "$.data.results.totalElements")).isZero();

        // Once shared, the document (and only it) becomes findable.
        api.call(admin, HttpMethod.POST, "/api/v1/access/documents/" + docId, "{\"userId\":\"" + officerBId + "\",\"rights\":[\"VIEW\"]}", 201);
        MvcResult shared = api.call(officerB, HttpMethod.GET, "/api/v1/search?q=acquisition", null, 200);
        assertThat((Integer) read(shared, "$.data.results.totalElements")).isEqualTo(1);
        // The organisation admin sees everything in their organisation.
        assertThat((Integer) read(api.call(admin, HttpMethod.GET, "/api/v1/search?q=acquisition", null, 200), "$.data.results.totalElements")).isEqualTo(1);
    }

    @Test
    void malwareIsQuarantinedAndCanNeverBeDownloaded() throws Exception {
        String folder = api.folder(admin, api.cabinet(admin, "Inbox", "DEFAULT"), "Scans");
        byte[] infected = ("Invoice attached " + FakeMalwareScanner.MARKER).getBytes(StandardCharsets.US_ASCII);
        String docId = api.uploadId(officerA, folder, "invoice.txt", infected);
        worker.drain();

        assertThat((String) read(api.call(officerA, HttpMethod.GET, "/api/v1/documents/" + docId, null, 200), "$.data.versions[0].processingStatus"))
                .isEqualTo("QUARANTINED");
        assertThat((String) read(api.call(admin, HttpMethod.GET, "/api/v1/documents/" + docId + "/content-url", null, 409), "$.code"))
                .isEqualTo("QUARANTINED");
        assertThat((Integer) read(api.call(admin, HttpMethod.GET, "/api/v1/search?q=invoice+attached", null, 200), "$.data.results.totalElements"))
                .as("quarantined content is not indexed").isZero();
        List<String> actions = TenantContext.callAs(alpha.getId(), () -> tx.execute(s ->
                auditEvents.findAllByOrderBySeqAsc().stream().map(AuditEvent::getAction).toList()));
        assertThat(actions).contains("DOCUMENT_QUARANTINED");
    }

    @Test
    void scannerOutageIsRetriedThenDeadLetteredWithoutCorruptingTheDocument() throws Exception {
        String folder = api.folder(admin, api.cabinet(admin, "Finance", "DEFAULT"), "Statements");
        byte[] pdf = pdf("Quarterly statement");
        String docId = api.uploadId(officerA, folder, "statement.pdf", pdf);

        FakeMalwareScanner.failNextScans(2);          // test profile: max-attempts 2, retry-base 0
        worker.drain();
        MvcResult failed = api.call(officerA, HttpMethod.GET, "/api/v1/documents/" + docId + "/processing", null, 200);
        assertThat((String) read(failed, "$.data[0].jobStatus")).isEqualTo("DEAD");
        assertThat((Integer) read(failed, "$.data[0].attempts")).isEqualTo(2);
        assertThat((String) read(failed, "$.data[0].versionStatus")).isEqualTo("FAILED");
        assertThat((String) read(api.call(officerA, HttpMethod.GET, "/api/v1/documents/" + docId + "/content-url", null, 409), "$.code"))
                .isEqualTo("PROCESSING_FAILED");
        // The document record itself is intact.
        assertThat((String) read(api.call(officerA, HttpMethod.GET, "/api/v1/documents/" + docId, null, 200), "$.data.title")).isEqualTo("statement");

        // Officers cannot reprocess; an administrator can, and it succeeds once the scanner is back.
        api.call(officerA, HttpMethod.POST, "/api/v1/documents/" + docId + "/reprocess", null, 403);
        api.call(admin, HttpMethod.POST, "/api/v1/documents/" + docId + "/reprocess", null, 200);
        worker.drain();
        assertThat(fetch(read(api.call(officerA, HttpMethod.GET, "/api/v1/documents/" + docId + "/content-url", null, 200), "$.data.url")))
                .isEqualTo(pdf);
    }

    @Test
    void concurrentWorkersProcessEachJobExactlyOnce() throws Exception {
        String folder = api.folder(admin, api.cabinet(admin, "Bulk", "DEFAULT"), "Batch");
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < 12; i++) ids.add(api.uploadId(officerA, folder, "doc" + i + ".pdf", pdf("Batch document number " + i)));

        ExecutorService pool = Executors.newFixedThreadPool(3);
        List<Callable<Integer>> runs = List.of(worker::drain, worker::drain, worker::drain);
        int processed = 0;
        for (Future<Integer> f : pool.invokeAll(runs)) processed += f.get();
        pool.shutdown();

        List<ProcessingJob> mine = tx.execute(s -> ids.stream()
                .flatMap(id -> jobs.findByTenantIdAndDocumentIdOrderByCreatedAtDesc(alpha.getId(), UUID.fromString(id)).stream())
                .toList());
        assertThat(mine).hasSize(12).allSatisfy(j -> {
            assertThat(j.getStatus()).isEqualTo(ProcessingJob.Status.DONE);
            assertThat(j.getAttempts()).as("SKIP LOCKED: never claimed twice").isEqualTo(1);
        });
        assertThat(processed).isGreaterThanOrEqualTo(12);
    }

    @Test
    void orphanedObjectsAreSweptAndReferencedOnesAreKept() throws Exception {
        String folder = api.folder(admin, api.cabinet(admin, "Keep", "DEFAULT"), "Safe");
        byte[] pdf = pdf("Keep me");
        String docId = api.uploadId(officerA, folder, "keep.pdf", pdf);
        worker.drain();
        String orphanKey = "t/" + alpha.getId() + "/d/" + UUID.randomUUID() + "/" + UUID.randomUUID();
        byte[] stray = "left behind by a failed upload".getBytes(StandardCharsets.US_ASCII);
        storage.put(orphanKey, new ByteArrayInputStream(stray), stray.length, "text/plain");

        assertThat(sweeper.sweep()).isGreaterThanOrEqualTo(1);
        assertThat(storage.listKeys(orphanKey, java.time.Instant.now().plusSeconds(60)).toList()).isEmpty();
        assertThat(fetch(read(api.call(officerA, HttpMethod.GET, "/api/v1/documents/" + docId + "/content-url", null, 200), "$.data.url")))
                .isEqualTo(pdf);
    }

    private static byte[] pdf(String text) throws Exception {
        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 11);
                cs.newLineAtOffset(72, 700);
                cs.showText(text);
                cs.endText();
            }
            doc.save(out);
            return out.toByteArray();
        }
    }
}
