package com.manageedocs.identity.service;

import com.manageedocs.config.JwtConfig;
import com.manageedocs.config.SecurityProperties;
import com.manageedocs.identity.model.User;
import com.manageedocs.tenancy.TenantContext;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

@Component
public class TokenService {

    public static final String TOKEN_VERSION_CLAIM = "tv";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final JwtEncoder encoder;
    private final SecurityProperties props;

    public TokenService(JwtEncoder encoder, SecurityProperties props) {
        this.encoder = encoder;
        this.props = props;
    }

    public record AccessToken(String value, Instant expiresAt) {
    }

    public AccessToken issueAccessToken(User user, Instant now) {
        Instant exp = now.plus(props.accessTokenTtl());
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(JwtConfig.ISSUER)
                .subject(user.getId().toString())
                .issuedAt(now)
                .expiresAt(exp)
                .id(UUID.randomUUID().toString())
                .claim(TenantContext.TENANT_CLAIM, user.getTenantId().toString())
                .claim(TOKEN_VERSION_CLAIM, user.getTokenVersion())
                .build();
        String value = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
        return new AccessToken(value, exp);
    }

    /** 256 bits of randomness, URL-safe. Only {@link #hash} of it is persisted. */
    public String newOpaqueToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public String hash(String opaqueToken) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(opaqueToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(d);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
