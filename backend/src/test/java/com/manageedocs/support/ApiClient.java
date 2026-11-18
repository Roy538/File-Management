package com.manageedocs.support;

import com.jayway.jsonpath.JsonPath;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Thin HTTP helpers for integration tests: every call asserts the expected status. */
public final class ApiClient {

    public static final String PASSWORD = "Correct-Horse-2026!";

    private final MockMvc mvc;

    public ApiClient(MockMvc mvc) {
        this.mvc = mvc;
    }

    public String login(String org, String email) throws Exception {
        MvcResult r = mvc.perform(request(HttpMethod.POST, "/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"organisation\":\"%s\",\"email\":\"%s\",\"password\":\"%s\"}".formatted(org, email, PASSWORD)))
                .andExpect(status().isOk()).andReturn();
        return read(r, "$.data.accessToken");
    }

    public String createUser(String token, String email, String role) throws Exception {
        return read(call(token, HttpMethod.POST, "/api/v1/users", """
                {"email":"%s","firstName":"Test","lastName":"%s","role":"%s","temporaryPassword":"%s"}
                """.formatted(email, role, role, PASSWORD), 201), "$.data.id");
    }

    public String cabinet(String token, String name, String visibility) throws Exception {
        return read(call(token, HttpMethod.POST, "/api/v1/cabinets",
                "{\"name\":\"" + name + "\",\"visibility\":\"" + visibility + "\"}", 201), "$.data.id");
    }

    public String folder(String token, String cabinetId, String name) throws Exception {
        return read(call(token, HttpMethod.POST, "/api/v1/cabinets/" + cabinetId + "/folders",
                "{\"name\":\"" + name + "\"}", 201), "$.data.id");
    }

    public MvcResult call(String token, HttpMethod method, String path, String json, int expected) throws Exception {
        MockHttpServletRequestBuilder req = request(method, path).header("Authorization", "Bearer " + token);
        if (json != null) req.contentType(MediaType.APPLICATION_JSON).content(json);
        return mvc.perform(req).andExpect(status().is(expected)).andReturn();
    }

    public MvcResult upload(String token, String folderId, String name, byte[] bytes, int expected) throws Exception {
        return mvc.perform(multipart("/api/v1/documents")
                        .file(new MockMultipartFile("file", name, "application/octet-stream", bytes))
                        .param("folderId", folderId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().is(expected)).andReturn();
    }

    public String uploadId(String token, String folderId, String name, byte[] bytes) throws Exception {
        return read(upload(token, folderId, name, bytes, 201), "$.data.document.id");
    }

    public static byte[] fetch(String url) throws Exception {
        HttpResponse<byte[]> r = HttpClient.newHttpClient()
                .send(HttpRequest.newBuilder(URI.create(url)).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
        if (r.statusCode() != 200) throw new AssertionError("GET presigned URL returned " + r.statusCode());
        return r.body();
    }

    @SuppressWarnings("unchecked")
    public static <T> T read(MvcResult r, String path) throws Exception {
        return (T) JsonPath.read(r.getResponse().getContentAsString(), path);
    }
}
