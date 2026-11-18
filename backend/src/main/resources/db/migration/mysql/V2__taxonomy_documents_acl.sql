-- ManageEDocs V2: capability overrides + token versioning, cabinet hierarchy, document types +
-- metadata schema, ACLs, documents with immutable versions (ADR-006), check-out locks.

-- Bumped on password change, role change, deactivation or "log out everywhere":
-- every access token carrying an older value is rejected on its next request.
ALTER TABLE app_user ADD COLUMN token_version INT NOT NULL DEFAULT 0;

-- Per-user capability overrides on top of RoleDefaults: effective = defaults + GRANTs - DENYs.
-- `permission` is a plain varchar validated by the application (com.manageedocs.security.Permission),
-- so adding a capability needs no ALTER. A permission is either granted or denied, never both.
CREATE TABLE user_permission (
  user_id     BINARY(16)  NOT NULL,
  tenant_id   BINARY(16)  NOT NULL,
  permission  VARCHAR(48) NOT NULL,
  effect      VARCHAR(5)  NOT NULL,
  granted_by  BINARY(16)  NULL,
  created_at  DATETIME(6) NOT NULL,
  PRIMARY KEY (user_id, permission),
  KEY ix_user_permission_tenant (tenant_id),
  CONSTRAINT fk_user_permission_user FOREIGN KEY (user_id) REFERENCES app_user (id),
  CONSTRAINT fk_user_permission_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT ck_user_permission_effect CHECK (effect IN ('GRANT','DENY'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE cabinet (
  id            BINARY(16)   NOT NULL,
  tenant_id     BINARY(16)   NOT NULL,
  name          VARCHAR(200) NOT NULL,
  description   VARCHAR(1000) NULL,
  visibility    VARCHAR(16)  NOT NULL,
  owner_id      BINARY(16)   NULL,
  created_at    DATETIME(6)  NOT NULL,
  updated_at    DATETIME(6)  NOT NULL,
  deleted_at    DATETIME(6)  NULL,
  version       BIGINT       NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_cabinet_tenant_name (tenant_id, name),
  KEY ix_cabinet_owner (tenant_id, owner_id),
  CONSTRAINT fk_cabinet_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT fk_cabinet_owner FOREIGN KEY (owner_id) REFERENCES app_user (id),
  CONSTRAINT ck_cabinet_visibility CHECK (visibility IN ('DEFAULT','PRIVATE','PERSONAL')),
  -- Personal/Private cabinets must have an owner.
  CONSTRAINT ck_cabinet_owner CHECK (visibility = 'DEFAULT' OR owner_id IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Folders nest arbitrarily. `path` is the materialised ancestor chain "/<id>/<id>/.../" (hex ids,
-- including self) so inherited permissions and subtree queries need no recursion.
CREATE TABLE folder (
  id            BINARY(16)   NOT NULL,
  tenant_id     BINARY(16)   NOT NULL,
  cabinet_id    BINARY(16)   NOT NULL,
  parent_id     BINARY(16)   NULL,
  name          VARCHAR(200) NOT NULL,
  path          VARCHAR(1700) NOT NULL,
  depth         INT          NOT NULL,
  created_at    DATETIME(6)  NOT NULL,
  updated_at    DATETIME(6)  NOT NULL,
  deleted_at    DATETIME(6)  NULL,
  version       BIGINT       NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_folder_children (tenant_id, cabinet_id, parent_id),
  KEY ix_folder_path (tenant_id, path(255)),
  CONSTRAINT fk_folder_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT fk_folder_cabinet FOREIGN KEY (cabinet_id) REFERENCES cabinet (id),
  CONSTRAINT fk_folder_parent FOREIGN KEY (parent_id) REFERENCES folder (id),
  CONSTRAINT ck_folder_depth CHECK (depth BETWEEN 1 AND 32)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sub_divider (
  id            BINARY(16)   NOT NULL,
  tenant_id     BINARY(16)   NOT NULL,
  folder_id     BINARY(16)   NOT NULL,
  name          VARCHAR(200) NOT NULL,
  created_at    DATETIME(6)  NOT NULL,
  updated_at    DATETIME(6)  NOT NULL,
  deleted_at    DATETIME(6)  NULL,
  version       BIGINT       NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_subdivider_folder (tenant_id, folder_id),
  CONSTRAINT fk_subdivider_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT fk_subdivider_folder FOREIGN KEY (folder_id) REFERENCES folder (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE document_type (
  id            BINARY(16)   NOT NULL,
  tenant_id     BINARY(16)   NOT NULL,
  name          VARCHAR(200) NOT NULL,
  description   VARCHAR(1000) NULL,
  active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    DATETIME(6)  NOT NULL,
  updated_at    DATETIME(6)  NOT NULL,
  version       BIGINT       NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT uk_document_type_name UNIQUE (tenant_id, name),
  CONSTRAINT fk_document_type_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Metadata schema per document type (configurable fields, validated server-side).
CREATE TABLE metadata_field (
  id                BINARY(16)   NOT NULL,
  tenant_id         BINARY(16)   NOT NULL,
  document_type_id  BINARY(16)   NOT NULL,
  field_key         VARCHAR(64)  NOT NULL,
  label             VARCHAR(200) NOT NULL,
  data_type         VARCHAR(16)  NOT NULL,
  required          BOOLEAN      NOT NULL DEFAULT FALSE,
  allowed_values    TEXT         NULL,   -- newline-separated, for ENUM
  sort_order        INT          NOT NULL DEFAULT 0,
  created_at        DATETIME(6)  NOT NULL,
  updated_at        DATETIME(6)  NOT NULL,
  version           BIGINT       NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT uk_metadata_field_key UNIQUE (document_type_id, field_key),
  KEY ix_metadata_field_tenant (tenant_id),
  CONSTRAINT fk_metadata_field_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT fk_metadata_field_type FOREIGN KEY (document_type_id) REFERENCES document_type (id),
  CONSTRAINT ck_metadata_field_type CHECK (data_type IN ('TEXT','NUMBER','DATE','BOOLEAN','ENUM'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Grants only (no deny entries): effective rights = role baseline + union of grants on the
-- cabinet, every ancestor folder, and the document itself. `permissions` is a bitmask
-- (see com.manageedocs.permissions.model.ResourceRight).
CREATE TABLE acl_entry (
  id              BINARY(16)  NOT NULL,
  tenant_id       BINARY(16)  NOT NULL,
  resource_type   VARCHAR(16) NOT NULL,
  resource_id     BINARY(16)  NOT NULL,
  principal_type  VARCHAR(8)  NOT NULL,
  user_id         BINARY(16)  NULL,
  role            VARCHAR(32) NULL,
  permissions     INT         NOT NULL,
  granted_by      BINARY(16)  NULL,
  created_at      DATETIME(6) NOT NULL,
  updated_at      DATETIME(6) NOT NULL,
  version         BIGINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_acl_resource (tenant_id, resource_type, resource_id),
  KEY ix_acl_user (tenant_id, user_id),
  CONSTRAINT fk_acl_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT fk_acl_user FOREIGN KEY (user_id) REFERENCES app_user (id),
  CONSTRAINT ck_acl_resource CHECK (resource_type IN ('CABINET','FOLDER','DOCUMENT')),
  CONSTRAINT ck_acl_principal CHECK (
    (principal_type = 'USER' AND user_id IS NOT NULL AND role IS NULL) OR
    (principal_type = 'ROLE' AND role IS NOT NULL AND user_id IS NULL)),
  CONSTRAINT ck_acl_permissions CHECK (permissions > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE document (
  id                  BINARY(16)   NOT NULL,
  tenant_id           BINARY(16)   NOT NULL,
  cabinet_id          BINARY(16)   NOT NULL,   -- denormalised for access filtering
  folder_id           BINARY(16)   NOT NULL,
  sub_divider_id      BINARY(16)   NULL,
  document_type_id    BINARY(16)   NULL,
  title               VARCHAR(300) NOT NULL,
  status              VARCHAR(16)  NOT NULL,
  current_version_no  INT          NOT NULL,
  owner_id            BINARY(16)   NOT NULL,
  locked_by           BINARY(16)   NULL,
  locked_at           DATETIME(6)  NULL,
  lock_expires_at     DATETIME(6)  NULL,
  created_at          DATETIME(6)  NOT NULL,
  updated_at          DATETIME(6)  NOT NULL,
  deleted_at          DATETIME(6)  NULL,
  deleted_by          BINARY(16)   NULL,
  version             BIGINT       NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_document_folder (tenant_id, folder_id, deleted_at, updated_at),
  KEY ix_document_subdivider (tenant_id, sub_divider_id),
  KEY ix_document_cabinet (tenant_id, cabinet_id),
  KEY ix_document_type (tenant_id, document_type_id),
  KEY ix_document_title (tenant_id, title),
  CONSTRAINT fk_document_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT fk_document_cabinet FOREIGN KEY (cabinet_id) REFERENCES cabinet (id),
  CONSTRAINT fk_document_folder FOREIGN KEY (folder_id) REFERENCES folder (id),
  CONSTRAINT fk_document_subdivider FOREIGN KEY (sub_divider_id) REFERENCES sub_divider (id),
  CONSTRAINT fk_document_type FOREIGN KEY (document_type_id) REFERENCES document_type (id),
  CONSTRAINT fk_document_owner FOREIGN KEY (owner_id) REFERENCES app_user (id),
  CONSTRAINT fk_document_locked_by FOREIGN KEY (locked_by) REFERENCES app_user (id),
  CONSTRAINT ck_document_status CHECK (status IN ('DRAFT','ACTIVE','UNDER_REVIEW','APPROVED','PUBLISHED','ARCHIVED')),
  CONSTRAINT ck_document_version_no CHECK (current_version_no >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Immutable: rows are only ever inserted. Binaries are addressed by a server-generated key.
CREATE TABLE document_version (
  id                  BINARY(16)   NOT NULL,
  tenant_id           BINARY(16)   NOT NULL,
  document_id         BINARY(16)   NOT NULL,
  version_no          INT          NOT NULL,
  storage_key         VARCHAR(255) NOT NULL,
  original_filename   VARCHAR(255) NOT NULL,
  content_type        VARCHAR(127) NOT NULL,
  size_bytes          BIGINT       NOT NULL,
  sha256              CHAR(64)     NOT NULL,
  processing_status   VARCHAR(16)  NOT NULL,
  change_comment      VARCHAR(1000) NULL,
  restored_from_no    INT          NULL,
  created_by          BINARY(16)   NOT NULL,
  created_at          DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uk_document_version UNIQUE (document_id, version_no),
  CONSTRAINT uk_document_version_key UNIQUE (storage_key),
  KEY ix_document_version_sha (tenant_id, sha256),
  CONSTRAINT fk_document_version_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT fk_document_version_document FOREIGN KEY (document_id) REFERENCES document (id),
  CONSTRAINT fk_document_version_creator FOREIGN KEY (created_by) REFERENCES app_user (id),
  CONSTRAINT ck_document_version_status CHECK (processing_status IN ('STORED','PROCESSING','AVAILABLE','FAILED','QUARANTINED')),
  CONSTRAINT ck_document_version_size CHECK (size_bytes > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Typed metadata values (one row per field per document).
CREATE TABLE document_metadata_value (
  id              BINARY(16)    NOT NULL,
  tenant_id       BINARY(16)    NOT NULL,
  document_id     BINARY(16)    NOT NULL,
  field_id        BINARY(16)    NOT NULL,
  value_text      VARCHAR(1000) NULL,
  value_number    DECIMAL(20,6) NULL,
  value_date      DATE          NULL,
  value_bool      BOOLEAN       NULL,
  PRIMARY KEY (id),
  CONSTRAINT uk_document_metadata UNIQUE (document_id, field_id),
  KEY ix_metadata_text (tenant_id, field_id, value_text(100)),
  KEY ix_metadata_number (tenant_id, field_id, value_number),
  KEY ix_metadata_date (tenant_id, field_id, value_date),
  CONSTRAINT fk_metadata_value_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT fk_metadata_value_document FOREIGN KEY (document_id) REFERENCES document (id),
  CONSTRAINT fk_metadata_value_field FOREIGN KEY (field_id) REFERENCES metadata_field (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
