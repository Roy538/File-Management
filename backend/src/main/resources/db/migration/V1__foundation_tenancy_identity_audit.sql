-- ManageEDocs V1: tenancy, identity, sessions, audit.
-- Conventions: InnoDB, utf8mb4, UTC timestamps (DATETIME(6)), UUID PKs stored as BINARY(16)
-- (time-ordered UUIDv7 to keep clustered indexes append-mostly), every tenant-owned table
-- carries tenant_id and leads its composite indexes with it.

CREATE TABLE tenant (
  id           BINARY(16)   NOT NULL,
  code         VARCHAR(32)  NOT NULL,
  name         VARCHAR(200) NOT NULL,
  active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   DATETIME(6)  NOT NULL,
  updated_at   DATETIME(6)  NOT NULL,
  version      BIGINT       NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT uk_tenant_code UNIQUE (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Departments / branches inside a tenant (legacy "Branch").
CREATE TABLE department (
  id           BINARY(16)   NOT NULL,
  tenant_id    BINARY(16)   NOT NULL,
  code         VARCHAR(32)  NOT NULL,
  name         VARCHAR(200) NOT NULL,
  active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   DATETIME(6)  NOT NULL,
  updated_at   DATETIME(6)  NOT NULL,
  version      BIGINT       NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT uk_department_code UNIQUE (tenant_id, code),
  CONSTRAINT fk_department_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE app_user (
  id                   BINARY(16)   NOT NULL,
  tenant_id            BINARY(16)   NOT NULL,
  department_id        BINARY(16)   NULL,
  email                VARCHAR(254) NOT NULL,
  password_hash        VARCHAR(100) NOT NULL,
  first_name           VARCHAR(100) NOT NULL,
  last_name            VARCHAR(100) NOT NULL,
  role                 VARCHAR(32)  NOT NULL,
  active               BOOLEAN      NOT NULL DEFAULT TRUE,
  failed_login_count   INT          NOT NULL DEFAULT 0,
  locked_until         DATETIME(6)  NULL,
  last_login_at        DATETIME(6)  NULL,
  password_changed_at  DATETIME(6)  NULL,
  created_at           DATETIME(6)  NOT NULL,
  updated_at           DATETIME(6)  NOT NULL,
  deleted_at           DATETIME(6)  NULL,
  version              BIGINT       NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  -- Email is unique per tenant: the same person may belong to two organisations.
  CONSTRAINT uk_user_email UNIQUE (tenant_id, email),
  CONSTRAINT fk_user_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT fk_user_department FOREIGN KEY (department_id) REFERENCES department (id),
  CONSTRAINT ck_user_role CHECK (role IN ('SUPER_ADMIN','ADMIN','OFFICER','DEPT_USER'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Opaque refresh tokens; only the SHA-256 hash is stored. Rotation forms a family:
-- presenting an already-rotated token revokes the whole family (theft detection).
CREATE TABLE refresh_token (
  id            BINARY(16)  NOT NULL,
  tenant_id     BINARY(16)  NOT NULL,
  user_id       BINARY(16)  NOT NULL,
  family_id     BINARY(16)  NOT NULL,
  token_hash    CHAR(64)    NOT NULL,
  issued_at     DATETIME(6) NOT NULL,
  expires_at    DATETIME(6) NOT NULL,
  revoked_at    DATETIME(6) NULL,
  replaced_by   BINARY(16)  NULL,
  user_agent    VARCHAR(255) NULL,
  ip_address    VARCHAR(45)  NULL,
  PRIMARY KEY (id),
  CONSTRAINT uk_refresh_hash UNIQUE (token_hash),
  KEY ix_refresh_family (family_id),
  KEY ix_refresh_user (tenant_id, user_id),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES app_user (id),
  CONSTRAINT fk_refresh_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Append-only, per-tenant hash-chained audit trail (ADR-011).
CREATE TABLE audit_event (
  id              BINARY(16)   NOT NULL,
  tenant_id       BINARY(16)   NOT NULL,
  seq             BIGINT       NOT NULL,
  occurred_at     DATETIME(6)  NOT NULL,
  actor_id        BINARY(16)   NULL,
  actor_label     VARCHAR(254) NULL,
  action          VARCHAR(64)  NOT NULL,
  outcome         VARCHAR(16)  NOT NULL,
  resource_type   VARCHAR(64)  NULL,
  resource_id     VARCHAR(64)  NULL,
  correlation_id  VARCHAR(64)  NULL,
  ip_address      VARCHAR(45)  NULL,
  -- Canonical JSON kept byte-for-byte (a JSON column would re-format it and break the hash).
  details         TEXT         NULL,
  prev_hash       CHAR(64)     NOT NULL,
  hash            CHAR(64)     NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uk_audit_seq UNIQUE (tenant_id, seq),
  KEY ix_audit_time (tenant_id, occurred_at),
  KEY ix_audit_resource (tenant_id, resource_type, resource_id),
  KEY ix_audit_actor (tenant_id, actor_id, occurred_at),
  CONSTRAINT fk_audit_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT ck_audit_outcome CHECK (outcome IN ('SUCCESS','FAILURE','DENIED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One row per tenant; locked FOR UPDATE when appending so seq/hash are gap-free and ordered.
CREATE TABLE audit_chain_head (
  tenant_id  BINARY(16) NOT NULL,
  last_seq   BIGINT     NOT NULL,
  last_hash  CHAR(64)   NOT NULL,
  PRIMARY KEY (tenant_id),
  CONSTRAINT fk_audit_head_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
