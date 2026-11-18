package com.manageedocs.identity.controller;

import com.manageedocs.identity.dto.AuthDtos;

import com.manageedocs.exception.ApiException;
import com.manageedocs.config.SecurityProperties;
import com.manageedocs.identity.dto.AuthDtos.LoginRequest;
import com.manageedocs.identity.dto.AuthDtos.SessionResponse;
import com.manageedocs.identity.dto.AuthDtos.UserProfile;
import com.manageedocs.common.dto.StandardAPIResponse;
import com.manageedocs.security.CurrentUser;
import com.manageedocs.identity.service.AuthService;
import com.manageedocs.identity.service.AuthService.Session;
import com.manageedocs.identity.service.CurrentUserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.time.Instant;

@Tag(name = "Authentication")
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    static final String REFRESH_COOKIE = "med_refresh";
    static final String COOKIE_PATH = "/api/v1/auth";
    /** Browsers cannot attach custom headers cross-site without a CORS preflight; required on cookie endpoints. */
    static final String CSRF_HEADER = "X-Requested-With";

    private final AuthService auth;
    private final CurrentUserService currentUser;
    private final SecurityProperties props;

    public AuthController(AuthService auth, CurrentUserService currentUser, SecurityProperties props) {
        this.auth = auth;
        this.currentUser = currentUser;
        this.props = props;
    }

    @Operation(summary = "Log in with organisation code, email and password")
    @PostMapping("/login")
    public ResponseEntity<StandardAPIResponse<SessionResponse>> login(@Valid @RequestBody LoginRequest body, HttpServletRequest req) {
        Session s = auth.login(body.organisation(), body.email(), body.password(), req.getRemoteAddr(),
                req.getHeader(HttpHeaders.USER_AGENT));
        return withCookie(s);
    }

    @Operation(summary = "Rotate the refresh cookie and get a new access token")
    @PostMapping("/refresh")
    public ResponseEntity<StandardAPIResponse<SessionResponse>> refresh(@CookieValue(name = REFRESH_COOKIE, required = false) String token,
                                                   HttpServletRequest req, HttpServletResponse res) {
        requireCsrfHeader(req);
        try {
            return withCookie(auth.refresh(token, req.getRemoteAddr(), req.getHeader(HttpHeaders.USER_AGENT)));
        } catch (ApiException e) {
            res.addHeader(HttpHeaders.SET_COOKIE, clearCookie().toString());
            throw e;
        }
    }

    @Operation(summary = "Revoke the current session")
    @PostMapping("/logout")
    public ResponseEntity<StandardAPIResponse<Void>> logout(@CookieValue(name = REFRESH_COOKIE, required = false) String token,
                                       HttpServletRequest req) {
        requireCsrfHeader(req);
        auth.logout(token, req.getRemoteAddr());
        return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, clearCookie().toString())
                .body(StandardAPIResponse.success("Signed out"));
    }

    @Operation(summary = "The authenticated user")
    @GetMapping("/me")
    public StandardAPIResponse<UserProfile> me() {
        return StandardAPIResponse.success(currentUser.profile(CurrentUser.get()), "Profile retrieved");
    }

    private ResponseEntity<StandardAPIResponse<SessionResponse>> withCookie(Session s) {
        ResponseCookie cookie = ResponseCookie.from(REFRESH_COOKIE, s.refreshToken())
                .httpOnly(true)
                .secure(props.refreshCookieSecure())
                .sameSite("Strict")
                .path(COOKIE_PATH)
                .maxAge(Duration.between(Instant.now(), s.refreshExpiresAt()))
                .build();
        SessionResponse body = new SessionResponse(s.accessToken().value(), s.accessToken().expiresAt(),
                UserProfile.of(s.caller(), s.tenant()));
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(StandardAPIResponse.success(body, "Signed in"));
    }

    private ResponseCookie clearCookie() {
        return ResponseCookie.from(REFRESH_COOKIE, "")
                .httpOnly(true).secure(props.refreshCookieSecure()).sameSite("Strict").path(COOKIE_PATH)
                .maxAge(0).build();
    }

    private static void requireCsrfHeader(HttpServletRequest req) {
        if (req.getHeader(CSRF_HEADER) == null) {
            throw ApiException.forbidden("Missing " + CSRF_HEADER + " header");
        }
    }
}
