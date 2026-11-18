package com.manageedocs.identity;

import com.jayway.jsonpath.JsonPath;
import com.manageedocs.audit.service.AuditService;
import com.manageedocs.audit.model.AuditEvent;
import com.manageedocs.audit.model.AuditOutcome;
import com.manageedocs.audit.repository.AuditEventRepository;
import com.manageedocs.identity.model.User;
import com.manageedocs.identity.repository.UserRepository;
import com.manageedocs.support.MySqlIntegrationTest;
import com.manageedocs.tenancy.TenantContext;
import com.manageedocs.tenancy.service.TenantProvisioningService;
import com.manageedocs.tenancy.service.TenantProvisioningService.AdminSpec;
import com.manageedocs.tenancy.model.Tenant;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Scenarios C and F at the identity layer: authentication, session security, tenant isolation, audit. */
class AuthFlowIT extends MySqlIntegrationTest {

    private static final String EMAIL = "admin@example.com";
    private static final String ALPHA_PW = "Alpha-Password-2026";
    private static final String BETA_PW = "Beta-Password-2026!";

    @Autowired MockMvc mvc;
    @Autowired TenantProvisioningService provisioning;
    @Autowired UserRepository users;
    @Autowired AuditEventRepository auditEvents;
    @Autowired AuditService audit;
    @Autowired TransactionTemplate tx;

    private Tenant alpha;
    private Tenant beta;

    @BeforeEach
    void provisionTwoOrganisationsWithTheSameAdminEmail() {
        String suffix = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        alpha = provisioning.provision("A" + suffix, "Alpha Ltd", new AdminSpec(EMAIL, ALPHA_PW, "Ann", "Alpha"));
        beta = provisioning.provision("B" + suffix, "Beta Ltd", new AdminSpec(EMAIL, BETA_PW, "Ben", "Beta"));
    }

    private MvcResult login(String org, String email, String password, int expectedStatus) throws Exception {
        return mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"organisation\":\"%s\",\"email\":\"%s\",\"password\":\"%s\"}".formatted(org, email, password)))
                .andExpect(status().is(expectedStatus))
                .andReturn();
    }

    private MvcResult refresh(Cookie cookie, int expectedStatus) throws Exception {
        var req = post("/api/v1/auth/refresh").header("X-Requested-With", "fetch");
        if (cookie != null) req.cookie(cookie);
        return mvc.perform(req).andExpect(status().is(expectedStatus)).andReturn();
    }

    @Test
    void loginIssuesInMemoryAccessTokenAndHttpOnlyRefreshCookie() throws Exception {
        MvcResult r = login(alpha.getCode(), EMAIL, ALPHA_PW, 200);
        Cookie cookie = r.getResponse().getCookie("med_refresh");
        assertThat(cookie).isNotNull();
        assertThat(cookie.isHttpOnly()).isTrue();
        assertThat(cookie.getPath()).isEqualTo("/api/v1/auth");
        assertThat(r.getResponse().getHeader("Set-Cookie")).contains("SameSite=Strict");
        String body = r.getResponse().getContentAsString();
        assertThat(body).doesNotContain(cookie.getValue());          // refresh token never in the body
        assertThat(body).doesNotContain("passwordHash").doesNotContain("$2a$");

        String token = JsonPath.read(body, "$.data.accessToken");
        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.email").value(EMAIL))
                .andExpect(jsonPath("$.data.organisation.code").value(alpha.getCode()))
                .andExpect(jsonPath("$.data.role").value("ADMIN"))
                .andExpect(jsonPath("$.successful").value(true))
                .andExpect(jsonPath("$.data.permissions").value(org.hamcrest.Matchers.hasItem("documents:upload")))
                .andExpect(jsonPath("$.data.permissions").value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("platform_tenants:manage"))));
    }

    @Test
    void protectedEndpointsRequireAValidToken() throws Exception {
        mvc.perform(get("/api/v1/auth/me")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.successful").value(false))
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer not-a-jwt")).andExpect(status().isUnauthorized());
    }

    @Test
    void failuresReturnOneGenericMessageAndLockTheAccount() throws Exception {
        String unknownOrg = login("NOPE-" + alpha.getCode(), EMAIL, ALPHA_PW, 401).getResponse().getContentAsString();
        String badPw = login(alpha.getCode(), EMAIL, "wrong-password-123", 401).getResponse().getContentAsString();
        String unknownUser = login(alpha.getCode(), "ghost@example.com", ALPHA_PW, 401).getResponse().getContentAsString();
        for (String b : List.of(unknownOrg, badPw, unknownUser)) {
            assertThat((String) JsonPath.read(b, "$.message")).isEqualTo("Invalid organisation, email or password");
        }
        for (int i = 0; i < 4; i++) login(alpha.getCode(), EMAIL, "wrong-password-123", 401);
        // Five failures reached: even the correct password is refused while locked.
        login(alpha.getCode(), EMAIL, ALPHA_PW, 401);
        // Lockout is per tenant: the same email in Beta is unaffected.
        login(beta.getCode(), EMAIL, BETA_PW, 200);
    }

    @Test
    void tenantsAreIsolatedEvenWithTheSameEmail() throws Exception {
        login(beta.getCode(), EMAIL, ALPHA_PW, 401);   // Alpha's password does not open Beta
        String betaToken = JsonPath.read(login(beta.getCode(), EMAIL, BETA_PW, 200).getResponse().getContentAsString(), "$.data.accessToken");
        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + betaToken))
                .andExpect(jsonPath("$.data.fullName").value("Ben Beta"))
                .andExpect(jsonPath("$.data.organisation.code").value(beta.getCode()));

        // Repository level: with Alpha pinned, Beta's rows are invisible, including by primary key.
        UUID betaUserId = TenantContext.callAs(beta.getId(), () -> tx.execute(s -> users.findByEmail(EMAIL).orElseThrow().getId()));
        TenantContext.runAs(alpha.getId(), () -> tx.executeWithoutResult(s -> {
            assertThat(users.findById(betaUserId)).isEmpty();
            assertThat(users.findAll()).extracting(User::getFirstName).containsOnly("Ann");
        }));
        // No tenant at all: fail closed.
        tx.executeWithoutResult(s -> assertThat(users.findAll()).isEmpty());

        // Directory lookup names colleagues only: Beta's user id does not resolve for Alpha.
        String alphaToken = JsonPath.read(login(alpha.getCode(), EMAIL, ALPHA_PW, 200).getResponse().getContentAsString(), "$.data.accessToken");
        UUID alphaUserId = TenantContext.callAs(alpha.getId(), () -> tx.execute(s -> users.findByEmail(EMAIL).orElseThrow().getId()));
        mvc.perform(get("/api/v1/directory/people").param("ids", alphaUserId + "," + betaUserId)
                        .header("Authorization", "Bearer " + alphaToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].fullName").value("Ann Alpha"))
                .andExpect(jsonPath("$.data[0].email").doesNotExist());
    }

    @Test
    void refreshRotatesAndReuseRevokesTheWholeFamily() throws Exception {
        Cookie first = login(alpha.getCode(), EMAIL, ALPHA_PW, 200).getResponse().getCookie("med_refresh");
        MvcResult rotated = refresh(first, 200);
        Cookie second = rotated.getResponse().getCookie("med_refresh");
        assertThat(second.getValue()).isNotEqualTo(first.getValue());
        assertThat((String) JsonPath.read(rotated.getResponse().getContentAsString(), "$.data.accessToken")).isNotBlank();

        refresh(first, 401);    // replay of a rotated token = theft signal
        refresh(second, 401);   // ...so the legitimate successor is revoked too

        TenantContext.runAs(alpha.getId(), () -> tx.executeWithoutResult(s ->
                assertThat(auditEvents.findAll()).anyMatch(e -> e.getAction().equals("REFRESH_TOKEN_REUSE")
                        && e.getOutcome() == AuditOutcome.DENIED)));
    }

    @Test
    void cookieEndpointsRequireTheAntiCsrfHeader() throws Exception {
        Cookie c = login(alpha.getCode(), EMAIL, ALPHA_PW, 200).getResponse().getCookie("med_refresh");
        mvc.perform(post("/api/v1/auth/refresh").cookie(c)).andExpect(status().isForbidden());
    }

    @Test
    void logoutRevokesTheSession() throws Exception {
        Cookie c = login(alpha.getCode(), EMAIL, ALPHA_PW, 200).getResponse().getCookie("med_refresh");
        mvc.perform(post("/api/v1/auth/logout").header("X-Requested-With", "fetch").cookie(c))
                .andExpect(status().isOk())
                .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.containsString("Max-Age=0")));
        refresh(c, 401);
    }

    @Test
    void auditTrailRecordsLoginsAndItsHashChainVerifies() throws Exception {
        login(alpha.getCode(), EMAIL, "wrong-password-123", 401);
        login(alpha.getCode(), EMAIL, ALPHA_PW, 200);
        TenantContext.runAs(alpha.getId(), () -> {
            List<AuditEvent> events = tx.execute(s -> auditEvents.findAllByOrderBySeqAsc());
            assertThat(events).extracting(AuditEvent::getAction)
                    .containsSubsequence("TENANT_PROVISIONED", "LOGIN", "LOGIN");
            assertThat(events).allMatch(e -> e.getTenantId().equals(alpha.getId()));
            assertThat(audit.verifyChain()).isEqualTo(-1);
        });
        // Beta's chain is independent and contains none of Alpha's events.
        TenantContext.runAs(beta.getId(), () -> {
            List<AuditEvent> betaEvents = tx.execute(s -> auditEvents.findAll());
            assertThat(betaEvents).extracting(AuditEvent::getAction).containsOnly("TENANT_PROVISIONED");
        });
    }
}
