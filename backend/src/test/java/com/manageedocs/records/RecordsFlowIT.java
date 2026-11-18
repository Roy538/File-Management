package com.manageedocs.records;

import com.manageedocs.audit.model.AuditEvent;
import com.manageedocs.audit.repository.AuditEventRepository;
import com.manageedocs.audit.service.AuditService;
import com.manageedocs.records.service.OverdueLoanService;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import static com.manageedocs.support.ApiClient.read;
import static org.assertj.core.api.Assertions.assertThat;

/** Physical file tracking (legacy Part A): register → request → approve → dispatch → overdue → return → archive. */
class RecordsFlowIT extends MySqlIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired TenantProvisioningService provisioning;
    @Autowired OverdueLoanService overdue;
    @Autowired AuditEventRepository auditEvents;
    @Autowired AuditService audit;
    @Autowired TransactionTemplate tx;
    @Autowired JdbcTemplate jdbc;

    private ApiClient api;
    private Tenant alpha;
    private String admin;
    private String officer;
    private String clerk;      // a second officer: decides requests the first one did not make
    private String dept;
    private String dept2;
    private String department;

    @BeforeEach
    void setUp() throws Exception {
        api = new ApiClient(mvc);
        String suffix = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        alpha = provisioning.provision("F" + suffix, "Alpha Ltd", new AdminSpec("admin@alpha.test", ApiClient.PASSWORD, "Rita", "Records"));
        admin = api.login(alpha.getCode(), "admin@alpha.test");
        api.createUser(admin, "officer@alpha.test", "OFFICER");
        api.createUser(admin, "clerk@alpha.test", "OFFICER");
        api.createUser(admin, "dept@alpha.test", "DEPT_USER");
        api.createUser(admin, "dept2@alpha.test", "DEPT_USER");
        officer = api.login(alpha.getCode(), "officer@alpha.test");
        clerk = api.login(alpha.getCode(), "clerk@alpha.test");
        dept = api.login(alpha.getCode(), "dept@alpha.test");
        dept2 = api.login(alpha.getCode(), "dept2@alpha.test");
        department = read(api.call(admin, HttpMethod.POST, "/api/v1/departments", "{\"code\":\"crd\",\"name\":\"Credit\"}", 201), "$.data.id");
    }

    @Test
    void aFileIsRequestedLentChasedReturnedAndArchivedWithAFullHistory() throws Exception {
        // Register. Numbers are unique per volume; department users cannot register files.
        String file = register(officer, "LN/2026/001", "Jane Wambui", 1);
        register(officer, "ln/2026/001", "Jane Wambui", 2);   // normalised to upper case, new volume
        api.call(officer, HttpMethod.POST, "/api/v1/records/files", fileJson("LN/2026/001", "Dup", 1), 409);
        api.call(dept, HttpMethod.POST, "/api/v1/records/files", fileJson("LN/2026/999", "Nope", 1), 403);
        List<String> found = read(api.call(dept, HttpMethod.GET, "/api/v1/records/files?q=wambui", null, 200), "$.data.content[*].fileNumber");
        assertThat(found).containsExactly("LN/2026/001", "LN/2026/001");

        // A department user asks for the file; registry staff are told; they cannot ask twice.
        String request = read(api.call(dept, HttpMethod.POST, "/api/v1/records/requests",
                "{\"fileId\":\"" + file + "\",\"department\":\"Credit\",\"purpose\":\"Loan top-up review\"}", 201), "$.data.id");
        api.call(dept, HttpMethod.POST, "/api/v1/records/requests",
                "{\"fileId\":\"" + file + "\",\"department\":\"Credit\"}", 409);
        assertThat(notificationTypes(officer)).contains("RECORDS_REQUEST_CREATED");
        // Department users only see their own requests, and cannot decide any.
        assertThat((Integer) read(api.call(dept2, HttpMethod.GET, "/api/v1/records/requests", null, 200), "$.data.totalElements")).isZero();
        api.call(dept2, HttpMethod.POST, "/api/v1/records/requests/" + request + "/cancel", null, 404);
        api.call(dept, HttpMethod.POST, "/api/v1/records/requests/" + request + "/approve", "{}", 403);

        // Dispatching against a request needs it approved first.
        String dispatch = "{\"dispatchedTo\":\"Mary Achieng\",\"department\":\"Credit\",\"reason\":\"Top-up\",\"expectedReturnOn\":\""
                + today().plusDays(3) + "\",\"requestId\":\"" + request + "\"}";
        assertThat((String) read(api.call(officer, HttpMethod.POST, "/api/v1/records/files/" + file + "/dispatch", dispatch, 409), "$.code"))
                .isEqualTo("REQUEST_NOT_APPROVED");
        api.call(officer, HttpMethod.POST, "/api/v1/records/requests/" + request + "/approve", "{\"notes\":\"OK\"}", 200);
        assertThat(notificationTypes(dept)).contains("RECORDS_REQUEST_APPROVED");
        api.call(officer, HttpMethod.POST, "/api/v1/records/files/" + file + "/dispatch",
                dispatch.replace(today().plusDays(3).toString(), today().minusDays(1).toString()), 400);   // due date in the past
        api.call(dept, HttpMethod.POST, "/api/v1/records/files/" + file + "/dispatch", dispatch, 403);
        MvcResult out = api.call(officer, HttpMethod.POST, "/api/v1/records/files/" + file + "/dispatch", dispatch, 200);
        assertThat((Boolean) read(out, "$.data.overdue")).isFalse();
        assertThat(notificationTypes(dept)).contains("RECORDS_REQUEST_DISPATCHED");
        assertThat((String) read(api.call(dept, HttpMethod.GET, "/api/v1/records/requests?mine=true", null, 200), "$.data.content[0].status"))
                .isEqualTo("FULFILLED");

        // A file can only be out once; asking for it while it is out warns the registry.
        assertThat((String) read(api.call(clerk, HttpMethod.POST, "/api/v1/records/files/" + file + "/dispatch",
                "{\"dispatchedTo\":\"X\",\"department\":\"Legal\"}", 409), "$.code")).isEqualTo("FILE_NOT_AVAILABLE");
        api.call(dept2, HttpMethod.POST, "/api/v1/records/requests", "{\"fileId\":\"" + file + "\",\"department\":\"Legal\"}", 201);
        assertThat(notificationTypes(clerk)).contains("RECORDS_REQUEST_FILE_OUT");

        // Overdue: reminded once per day, however often the check runs.
        jdbc.update("update file_dispatch set expected_return_on = ? where file_id = ?", today().minusDays(2), uuidBytes(file));
        assertThat(TenantContext.callAs(alpha.getId(), overdue::notifyOverdue)).isEqualTo(1);
        assertThat(TenantContext.callAs(alpha.getId(), overdue::notifyOverdue)).isZero();
        assertThat(notificationTypes(officer)).contains("RECORDS_FILE_OVERDUE");
        List<Boolean> overdueFlags = read(api.call(officer, HttpMethod.GET, "/api/v1/records/dispatches/outstanding?overdueOnly=true", null, 200), "$.data[*].overdue");
        assertThat(overdueFlags).containsExactly(true);

        // Return to the wrong place: the location is required, and administrators are alerted.
        api.call(officer, HttpMethod.POST, "/api/v1/records/files/" + file + "/return",
                "{\"returnedByName\":\"Mary Achieng\",\"condition\":\"WORN\",\"returnedToCorrectLocation\":false}", 400);
        MvcResult back = api.call(officer, HttpMethod.POST, "/api/v1/records/files/" + file + "/return",
                "{\"returnedByName\":\"Mary Achieng\",\"condition\":\"WORN\",\"returnedToCorrectLocation\":false,\"location\":\"Cabinet 9\"}", 200);
        assertThat((String) read(back, "$.data.returnLocation")).isEqualTo("Cabinet 9");
        assertThat(notificationTypes(admin)).contains("RECORDS_WRONG_LOCATION");
        api.call(officer, HttpMethod.POST, "/api/v1/records/files/" + file + "/return",
                "{\"returnedByName\":\"Mary\",\"condition\":\"GOOD\",\"returnedToCorrectLocation\":true}", 409);

        // Shelve, archive; only an administrator restores from the archive.
        status(officer, file, "SHELVE", "Shelf A3", 200);
        status(officer, file, "ARCHIVE", null, 200);
        assertThat((String) read(api.call(dept, HttpMethod.POST, "/api/v1/records/requests",
                "{\"fileId\":\"" + file + "\",\"department\":\"Credit\"}", 409), "$.code")).isEqualTo("FILE_UNAVAILABLE");
        status(officer, file, "RESTORE", null, 403);
        status(admin, file, "RESTORE", null, 200);
        status(officer, file, "RECOVER", null, 409);   // not missing: the lifecycle refuses

        MvcResult detail = api.call(officer, HttpMethod.GET, "/api/v1/records/files/" + file, null, 200);
        assertThat((String) read(detail, "$.data.file.status")).isEqualTo("AVAILABLE");
        List<String> actions = read(detail, "$.data.movements[*].action");
        assertThat(actions).containsExactly("RECOVERED", "ARCHIVED", "RELOCATED", "RETURNED", "DISPATCHED", "CREATED");
        List<String> allowed = read(detail, "$.data.allowedActions");
        assertThat(allowed).contains("DISPATCH", "ARCHIVE", "FLAG_MISSING").doesNotContain("RETURN", "RESTORE");
        List<String> deptAllowed = read(api.call(dept, HttpMethod.GET, "/api/v1/records/files/" + file, null, 200), "$.data.allowedActions");
        assertThat(deptAllowed).containsExactly("REQUEST");

        // Every change is in the tamper-evident audit trail.
        List<AuditEvent> events = TenantContext.callAs(alpha.getId(), () -> tx.execute(s -> auditEvents.findAllByOrderBySeqAsc()));
        assertThat(events).extracting(AuditEvent::getAction).contains("PHYSICAL_FILE_CREATED", "FILE_REQUEST_APPROVED",
                "PHYSICAL_FILE_DISPATCHED", "PHYSICAL_FILE_RETURNED", "PHYSICAL_FILE_ARCHIVE", "PHYSICAL_FILE_RESTORE");
        assertThat(events).anySatisfy(e -> {
            assertThat(e.getAction()).isEqualTo("ACCESS_DENIED");
            assertThat(e.getResourceId()).isEqualTo(file);
        });
        TenantContext.runAs(alpha.getId(), () -> assertThat(audit.verifyChain()).isEqualTo(-1));
    }

    @Test
    void reportsAgreeAcrossScreenCsvExcelAndPdf() throws Exception {
        String lent = register(officer, "AC-100", "Peter Kariuki", 1);
        String lost = register(officer, "AC-200", "Zoë Müller", 1);   // non-ASCII must survive every format
        register(officer, "AC-300", "Grace Njeri", 1);
        api.call(officer, HttpMethod.POST, "/api/v1/records/files/" + lent + "/dispatch",
                "{\"dispatchedTo\":\"Tom\",\"department\":\"Legal\",\"expectedReturnOn\":\"" + today().plusDays(1) + "\"}", 200);
        status(officer, lost, "FLAG_MISSING", null, 200);
        assertThat(notificationTypes(admin)).contains("RECORDS_FILE_MISSING");

        List<List<String>> outstanding = read(api.call(officer, HttpMethod.GET, "/api/v1/reports/outstanding", null, 200), "$.data.rows");
        assertThat(outstanding).hasSize(1).first().satisfies(r -> assertThat(r.getFirst()).isEqualTo("AC-100"));
        List<String> missing = read(api.call(officer, HttpMethod.GET, "/api/v1/reports/missing", null, 200), "$.data.rows[*][0]");
        assertThat(missing).containsExactly("AC-200");
        assertThat((Integer) read(api.call(officer, HttpMethod.GET, "/api/v1/reports/daily-dispatches?date=" + today(), null, 200),
                "$.data.rows.length()")).isEqualTo(1);
        MvcResult monthly = api.call(officer, HttpMethod.GET, "/api/v1/reports/monthly?year=" + today().getYear()
                + "&month=" + today().getMonthValue(), null, 200);
        assertThat((String) read(monthly, "$.data.totals[2]")).isEqualTo("1");
        assertThat((Integer) read(monthly, "$.data.rows.length()")).isEqualTo(today().lengthOfMonth());
        List<String> byDept = read(api.call(officer, HttpMethod.GET, "/api/v1/reports/by-department", null, 200), "$.data.totals");
        assertThat(byDept.get(1)).isEqualTo("3");
        List<String> history = read(api.call(officer, HttpMethod.GET, "/api/v1/reports/movement-history?fileId=" + lent, null, 200), "$.data.rows[*][1]");
        assertThat(history).containsExactly("Created", "Dispatched");
        api.call(officer, HttpMethod.GET, "/api/v1/reports/nonsense", null, 400);
        api.call(dept, HttpMethod.GET, "/api/v1/reports/outstanding", null, 403);

        MvcResult csv = api.call(officer, HttpMethod.GET, "/api/v1/reports/missing/export?format=csv", null, 200);
        assertThat(csv.getResponse().getHeader("Content-Disposition")).contains("missing-").contains(".csv");
        assertThat(csv.getResponse().getContentAsString(StandardCharsets.UTF_8)).contains("AC-200").contains("Zoë Müller");
        byte[] xlsx = api.call(officer, HttpMethod.GET, "/api/v1/reports/outstanding/export?format=xlsx", null, 200).getResponse().getContentAsByteArray();
        assertThat(new String(xlsx, 0, 2, StandardCharsets.US_ASCII)).isEqualTo("PK");   // zip container
        byte[] pdf = api.call(officer, HttpMethod.GET, "/api/v1/reports/missing/export?format=pdf", null, 200).getResponse().getContentAsByteArray();
        assertThat(new String(pdf, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
        api.call(officer, HttpMethod.GET, "/api/v1/reports/missing/export?format=docx", null, 400);

        List<AuditEvent> events = TenantContext.callAs(alpha.getId(), () -> tx.execute(s -> auditEvents.findAllByOrderBySeqAsc()));
        assertThat(events.stream().filter(e -> e.getAction().equals("REPORT_EXPORTED")).count()).isEqualTo(3);

        // Dashboard: registry figures for staff, own-request counts for department users.
        MvcResult dash = api.call(officer, HttpMethod.GET, "/api/v1/dashboard", null, 200);
        assertThat((Integer) read(dash, "$.data.records.totalFiles")).isEqualTo(3);
        assertThat((Integer) read(dash, "$.data.records.outOnLoan")).isEqualTo(1);
        assertThat((Integer) read(dash, "$.data.records.byStatus.MISSING")).isEqualTo(1);
        assertThat((Integer) read(dash, "$.data.records.dispatchedToday")).isEqualTo(1);
        assertThat((Integer) read(dash, "$.data.documents.visible")).isZero();
    }

    @Test
    void anotherOrganisationCannotSeeOrTouchTheRegister() throws Exception {
        String file = register(officer, "SEC-1", "Confidential Customer", 1);
        String suffix = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        Tenant beta = provisioning.provision("G" + suffix, "Beta Ltd", new AdminSpec("admin@beta.test", ApiClient.PASSWORD, "Bea", "Admin"));
        String betaAdmin = api.login(beta.getCode(), "admin@beta.test");

        api.call(betaAdmin, HttpMethod.GET, "/api/v1/records/files/" + file, null, 404);
        api.call(betaAdmin, HttpMethod.POST, "/api/v1/records/files/" + file + "/dispatch", "{\"dispatchedTo\":\"X\",\"department\":\"Y\"}", 404);
        api.call(betaAdmin, HttpMethod.POST, "/api/v1/records/files/" + file + "/status", "{\"action\":\"ARCHIVE\"}", 404);
        api.call(betaAdmin, HttpMethod.POST, "/api/v1/records/requests", "{\"fileId\":\"" + file + "\",\"department\":\"Y\"}", 404);
        api.call(betaAdmin, HttpMethod.GET, "/api/v1/reports/movement-history?fileId=" + file, null, 404);
        assertThat((Integer) read(api.call(betaAdmin, HttpMethod.GET, "/api/v1/records/files", null, 200), "$.data.totalElements")).isZero();
        assertThat((Integer) read(api.call(betaAdmin, HttpMethod.GET, "/api/v1/dashboard", null, 200), "$.data.records.totalFiles")).isZero();
        // Beta may reuse the same file number: uniqueness is per organisation.
        api.call(betaAdmin, HttpMethod.POST, "/api/v1/records/files",
                "{\"fileNumber\":\"SEC-1\",\"customerName\":\"Other\",\"dateOpened\":\"" + today() + "\"}", 201);
        // Departments are per organisation too.
        api.call(betaAdmin, HttpMethod.POST, "/api/v1/records/files",
                "{\"fileNumber\":\"SEC-2\",\"customerName\":\"X\",\"dateOpened\":\"" + today() + "\",\"departmentId\":\"" + department + "\"}", 404);
        assertThat((String) read(api.call(officer, HttpMethod.GET, "/api/v1/records/files/" + file, null, 200), "$.data.file.status")).isEqualTo("AVAILABLE");
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private String register(String token, String number, String customer, int volume) throws Exception {
        return read(api.call(token, HttpMethod.POST, "/api/v1/records/files", fileJson(number, customer, volume), 201), "$.data.id");
    }

    private String fileJson(String number, String customer, int volume) {
        return "{\"fileNumber\":\"" + number + "\",\"customerName\":\"" + customer + "\",\"volumeNumber\":" + volume
                + ",\"dateOpened\":\"" + today().minusYears(1) + "\",\"departmentId\":\"" + department + "\",\"homeLocation\":\"Shelf A3\"}";
    }

    private void status(String token, String file, String action, String location, int expected) throws Exception {
        api.call(token, HttpMethod.POST, "/api/v1/records/files/" + file + "/status",
                "{\"action\":\"" + action + "\"" + (location == null ? "" : ",\"location\":\"" + location + "\"") + "}", expected);
    }

    private List<String> notificationTypes(String token) throws Exception {
        return read(api.call(token, HttpMethod.GET, "/api/v1/notifications?size=100", null, 200), "$.data.content[*].type");
    }

    private static LocalDate today() {
        return LocalDate.now(ZoneId.of("Africa/Nairobi"));
    }

    private static byte[] uuidBytes(String id) {
        UUID u = UUID.fromString(id);
        return java.nio.ByteBuffer.allocate(16).putLong(u.getMostSignificantBits()).putLong(u.getLeastSignificantBits()).array();
    }
}
