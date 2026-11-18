# ManageEDocs Backend (Spring Boot)

The target backend for ManageEDocs: a Java 21 / Spring Boot 4.0 modular monolith on MySQL 8.4, with Flyway owning the schema. Design: `docs/architecture/system-overview.md`. Decisions: `docs/architecture/architecture-decisions.md`.

> Status: **Phase 2 foundation.** The NestJS app in `apps/api` remains the production system until cutover (ADR-001/002).

## What exists

| Module | Contents |
|---|---|
| `tenancy` | `Tenant`, `Department`, Hibernate `@TenantId` discriminator. Tenant is resolved **only** from the JWT `tid` claim or a code-controlled override (`TenantContext.callAs`), and fails closed when absent. `TenantProvisioningService` creates the organisation, its audit chain head and the first admin. |
| `identity` | Login by organisation code + email + password. BCrypt(12). Per-tenant lockout after 5 failures. The access JWT (HS256, 10 min) is returned in the body. The opaque refresh token sits in an `HttpOnly; SameSite=Strict` cookie, is stored hashed, rotates on every use, and reuse revokes the whole family. Cookie endpoints require `X-Requested-With`. `/api/v1/auth/me`. |
| `audit` | Append-only `audit_event`, hash-chained per tenant (`prev_hash` → `hash`), plus chain verification. Events are written in the caller's transaction. |
| `common` | UUIDv7 ids, `BaseEntity` (timestamps + optimistic `@Version`), RFC 9457 problem responses with `code` + `correlationId`, correlation-ID filter. |
| `config` | Stateless Spring Security, CORS allowlist, security headers, JWT encoder/decoder, validated `manageedocs.security.*` properties. |

## Run locally

```bash
# MySQL 8.4 (dev)
docker run -d --name med-mysql -p 3306:3306 \
  -e MYSQL_DATABASE=manageedocs -e MYSQL_USER=manageedocs -e MYSQL_PASSWORD=devpass \
  -e MYSQL_RANDOM_ROOT_PASSWORD=yes mysql:8.4

cd backend
DB_PASSWORD=devpass SPRING_PROFILES_ACTIVE=dev mvn spring-boot:run
```

The `dev` profile seeds organisation **MC** with admin `admin@manageedocs.local` / `ChangeMe-Dev-2026!`. Override these with `DEV_ADMIN_EMAIL` / `DEV_ADMIN_PASSWORD`. The seed never runs outside `dev`.

- OpenAPI: `http://localhost:8080/api/v1/openapi` · Swagger UI: `/api/v1/docs`
- Health: `/actuator/health/liveness`, `/actuator/health/readiness`

## Configuration (environment)

| Variable | Default | Notes |
|---|---|---|
| `DB_URL` | `jdbc:mysql://localhost:3306/manageedocs?...` | UTC connection time zone |
| `DB_USERNAME` / `DB_PASSWORD` | `manageedocs` / *(empty)* | |
| `JWT_SECRET` | dev-only value | **Must** be set in every non-dev environment; ≥ 32 bytes |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | `PT10M` / `P7D` | ISO-8601 durations |
| `REFRESH_COOKIE_SECURE` | `true` | `false` only for plain-HTTP local dev |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowlist |
| `UPLOAD_MAX_FILE_SIZE` | `100MB` | |

## Tests

```bash
mvn test      # unit + ArchUnit layering rules (no Docker needed)
mvn verify    # + *IT integration tests on a real MySQL 8.4 via Testcontainers (Docker required)
```

`AuthFlowIT` covers login, generic failure messages, lockout, tenant isolation with the same email in two organisations (HTTP and repository level, plus fail-closed without a tenant), refresh rotation with reuse detection, anti-CSRF header, logout, and audit chain integrity.
