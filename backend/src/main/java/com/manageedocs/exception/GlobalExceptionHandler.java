package com.manageedocs.exception;

import com.manageedocs.common.dto.StandardAPIResponse;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Every failure leaves through here as a {@link StandardAPIResponse} with {@code successful=false},
 * a stable {@code code} and the request's {@code correlationId}. Do not add {@code @ExceptionHandler}
 * to individual controllers. Unexpected errors never leak internals.
 *
 * <p>Service conventions: {@link ApiException} for expected outcomes with a specific status;
 * {@code IllegalArgumentException} → 400 (invalid input); {@code IllegalStateException} → 409
 * (valid input, wrong state).
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private final SecurityEventRecorder securityEvents;

    public GlobalExceptionHandler(SecurityEventRecorder securityEvents) {
        this.securityEvents = securityEvents;
    }

    @ExceptionHandler(ApiException.class)
    ResponseEntity<StandardAPIResponse<Void>> api(ApiException ex) {
        if (ex.isAccessDenial()) securityEvents.accessDenied(ex);
        return build(ex.status(), ex.code(), ex.getMessage());
    }

    @ExceptionHandler({AccessDeniedException.class, AuthorizationDeniedException.class})
    ResponseEntity<StandardAPIResponse<Void>> denied(RuntimeException ex) {
        return build(HttpStatus.FORBIDDEN, "FORBIDDEN", "You do not have permission to perform this action");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<StandardAPIResponse<Void>> invalid(MethodArgumentNotValidException ex) {
        Map<String, String> fields = new LinkedHashMap<>();
        for (FieldError fe : ex.getBindingResult().getFieldErrors()) {
            fields.putIfAbsent(fe.getField(), fe.getDefaultMessage());
        }
        return ResponseEntity.badRequest()
                .body(StandardAPIResponse.failure("VALIDATION_FAILED", "Some fields are invalid", fields));
    }

    @ExceptionHandler(FieldValidationException.class)
    ResponseEntity<StandardAPIResponse<Void>> fieldValidation(FieldValidationException ex) {
        return ResponseEntity.badRequest()
                .body(StandardAPIResponse.failure("VALIDATION_FAILED", ex.getMessage(), ex.fieldErrors()));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<StandardAPIResponse<Void>> constraint(ConstraintViolationException ex) {
        return build(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", ex.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<StandardAPIResponse<Void>> illegalArgument(IllegalArgumentException ex) {
        return build(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", ex.getMessage());
    }

    @ExceptionHandler(IllegalStateException.class)
    ResponseEntity<StandardAPIResponse<Void>> illegalState(IllegalStateException ex) {
        return build(HttpStatus.CONFLICT, "INVALID_STATE", ex.getMessage());
    }

    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    ResponseEntity<StandardAPIResponse<Void>> optimisticLock(ObjectOptimisticLockingFailureException ex) {
        return build(HttpStatus.CONFLICT, "CONCURRENT_MODIFICATION",
                "This record was changed by someone else. Reload and try again.");
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<StandardAPIResponse<Void>> integrity(DataIntegrityViolationException ex) {
        log.warn("Data integrity violation: {}", ex.getMostSpecificCause().getMessage());
        return build(HttpStatus.CONFLICT, "CONFLICT", "The change conflicts with existing data");
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<StandardAPIResponse<Void>> tooLarge(MaxUploadSizeExceededException ex) {
        return build(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE", "The uploaded file exceeds the maximum allowed size");
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<StandardAPIResponse<Void>> unreadable(HttpMessageNotReadableException ex) {
        return build(HttpStatus.BAD_REQUEST, "MALFORMED_BODY", "Malformed request body");
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<StandardAPIResponse<Void>> typeMismatch(MethodArgumentTypeMismatchException ex) {
        return build(HttpStatus.BAD_REQUEST, "INVALID_PARAMETER", "Invalid value for '" + ex.getName() + "'");
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    ResponseEntity<StandardAPIResponse<Void>> missingParam(MissingServletRequestParameterException ex) {
        return build(HttpStatus.BAD_REQUEST, "MISSING_PARAMETER", "Missing required parameter '" + ex.getParameterName() + "'");
    }

    @ExceptionHandler(MissingServletRequestPartException.class)
    ResponseEntity<StandardAPIResponse<Void>> missingPart(MissingServletRequestPartException ex) {
        return build(HttpStatus.BAD_REQUEST, "MISSING_PARAMETER", "Missing required part '" + ex.getRequestPartName() + "'");
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<StandardAPIResponse<Void>> noEndpoint(NoResourceFoundException ex) {
        return build(HttpStatus.NOT_FOUND, "NOT_FOUND", "No endpoint at " + ex.getResourcePath());
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<StandardAPIResponse<Void>> method(HttpRequestMethodNotSupportedException ex) {
        return build(HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED", ex.getMethod() + " is not supported on this endpoint");
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<StandardAPIResponse<Void>> unexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR",
                "Something went wrong. Quote the correlation ID if you contact support.");
    }

    private static ResponseEntity<StandardAPIResponse<Void>> build(HttpStatus status, String code, String message) {
        return ResponseEntity.status(status).body(StandardAPIResponse.failure(code, message));
    }
}
