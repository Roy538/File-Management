package com.manageedocs.exception;

import org.springframework.http.HttpStatus;

/** Base for expected, client-facing failures. The message is safe to show to users. */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    /** Set when this failure is an object-level access denial that must be audited (resource type, id). */
    private String deniedResourceType;
    private String deniedResourceId;

    public ApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    /** Marks this failure as an access denial on a specific object, to be recorded as a security event. */
    public ApiException deniedOn(String resourceType, Object resourceId) {
        this.deniedResourceType = resourceType;
        this.deniedResourceId = resourceId == null ? null : resourceId.toString();
        return this;
    }

    public boolean isAccessDenial() {
        return deniedResourceType != null;
    }

    public String deniedResourceType() {
        return deniedResourceType;
    }

    public String deniedResourceId() {
        return deniedResourceId;
    }

    /** Also used for resources in another tenant / not visible, so IDs cannot be probed. */
    public static ApiException notFound(String what) {
        return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", what + " not found");
    }

    public static ApiException conflict(String code, String message) {
        return new ApiException(HttpStatus.CONFLICT, code, message);
    }

    public static ApiException badRequest(String code, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }

    public static ApiException unauthorized(String message) {
        return new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", message);
    }

    public static ApiException forbidden(String message) {
        return new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", message);
    }
}
