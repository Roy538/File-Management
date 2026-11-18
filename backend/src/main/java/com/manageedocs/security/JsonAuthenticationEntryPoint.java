package com.manageedocs.security;

import com.manageedocs.common.web.CorrelationIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;

/** 401 in the same {@code StandardAPIResponse} shape as every other failure. */
public class JsonAuthenticationEntryPoint implements AuthenticationEntryPoint {

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException ex)
            throws IOException {
        String correlationId = MDC.get(CorrelationIdFilter.MDC_KEY);
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        // Fixed text only: nothing from the request or exception is echoed.
        response.getWriter().write("{\"data\":null,\"errors\":null,\"message\":\"Authentication required\","
                + "\"successful\":false,\"timestamp\":\"" + Instant.now() + "\",\"code\":\"UNAUTHORIZED\","
                + "\"correlationId\":" + (correlationId == null ? "null" : "\"" + correlationId + "\"") + "}");
    }
}
