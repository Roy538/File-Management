package com.manageedocs.exception;

import java.util.Map;

/** Business validation that failed on specific fields (e.g. metadata); surfaces as 400 with {@code errors}. */
public class FieldValidationException extends RuntimeException {

    private final Map<String, String> fieldErrors;

    public FieldValidationException(String message, Map<String, String> fieldErrors) {
        super(message);
        this.fieldErrors = Map.copyOf(fieldErrors);
    }

    public Map<String, String> fieldErrors() {
        return fieldErrors;
    }
}
