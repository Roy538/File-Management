package com.manageedocs.common.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** Request facts for audit records. Behind the reverse proxy, server.forward-headers-strategy resolves the client IP. */
public final class RequestInfo {

    private RequestInfo() {
    }

    /** The client address, or null outside an HTTP request (background jobs). */
    public static String clientIp() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
            HttpServletRequest req = attrs.getRequest();
            return req.getRemoteAddr();
        }
        return null;
    }
}
