package com.manageedocs.config;

import com.manageedocs.identity.service.TokenService;
import com.manageedocs.security.AppUserDetailsLoader;
import com.manageedocs.security.CallerAuthentication;
import com.manageedocs.security.JsonAuthenticationEntryPoint;
import com.manageedocs.tenancy.TenantContext;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

/**
 * Stateless API security. Everything under /api/v1 requires a valid access token except the
 * auth endpoints that establish one. Layer 1: {@code @PreAuthorize} capability checks on every
 * endpoint (authorities = role defaults ± per-user overrides, loaded per request). Layer 2:
 * service-level object scoping (tenant via {@link TenantContext}, cabinet/folder/document ACLs).
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain apiSecurity(HttpSecurity http, AppUserDetailsLoader loader) throws Exception {
        http
                // Uses the bean named "corsConfigurationSource" below.
                .cors(Customizer.withDefaults())
                // Bearer tokens in an Authorization header are not sent automatically by browsers, so
                // CSRF does not apply to them. The cookie-based refresh/logout endpoints are protected
                // by SameSite=Strict + a required custom header (see AuthController).
                .csrf(c -> c.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .headers(h -> h
                        .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'none'; frame-ancestors 'none'"))
                        .referrerPolicy(r -> r.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER))
                        .httpStrictTransportSecurity(hsts -> hsts.includeSubDomains(true).maxAgeInSeconds(31536000)))
                .authorizeHttpRequests(a -> a
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/logout").permitAll()
                        .requestMatchers("/api/v1/openapi/**", "/api/v1/docs/**", "/swagger-ui/**").permitAll()
                        // Actuator lives on the separate management port (8079), which must never be
                        // exposed publicly — reachable only by the orchestrator and Prometheus.
                        .requestMatchers("/actuator/**").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(o -> o
                        .jwt(j -> j.jwtAuthenticationConverter(callerConverter(loader)))
                        .authenticationEntryPoint(new JsonAuthenticationEntryPoint()))
                .exceptionHandling(e -> e.authenticationEntryPoint(new JsonAuthenticationEntryPoint()));
        return http.build();
    }

    /** Verified JWT → caller rebuilt from the database (active user + organisation, current token version). */
    static Converter<Jwt, AbstractAuthenticationToken> callerConverter(AppUserDetailsLoader loader) {
        return jwt -> {
            try {
                UUID tenantId = UUID.fromString(jwt.getClaimAsString(TenantContext.TENANT_CLAIM));
                UUID userId = UUID.fromString(jwt.getSubject());
                Object tv = jwt.getClaim(TokenService.TOKEN_VERSION_CLAIM);
                int tokenVersion = tv instanceof Number n ? n.intValue() : -1;
                return loader.load(tenantId, userId, tokenVersion)
                        .<AbstractAuthenticationToken>map(CallerAuthentication::new)
                        .orElseThrow(() -> new InvalidBearerTokenException("Session is no longer valid"));
            } catch (IllegalArgumentException | NullPointerException e) {
                throw new InvalidBearerTokenException("Malformed token");
            }
        };
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        // Cost 12; also verifies legacy $2b$ hashes from the NestJS system (ADR-010).
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(SecurityProperties props) {
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(props.corsOrigins() == null ? List.of() : props.corsOrigins());
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-Requested-With", "X-Correlation-Id", "If-Match"));
        cfg.setExposedHeaders(List.of("X-Correlation-Id", "ETag", "Location"));
        cfg.setAllowCredentials(true);
        cfg.setMaxAge(Duration.ofHours(1));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", cfg);
        return source;
    }
}
