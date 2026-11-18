package com.manageedocs.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Optional;

public final class CurrentUser {

    private CurrentUser() {
    }

    /** The authenticated caller. Only call behind an authenticated endpoint — no anonymous fallback. */
    public static AppUserDetails get() {
        return find().orElseThrow(() ->
                new IllegalStateException("No authenticated AppUserDetails principal in the security context"));
    }

    public static Optional<AppUserDetails> find() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getPrincipal() instanceof AppUserDetails caller ? Optional.of(caller) : Optional.empty();
    }
}
