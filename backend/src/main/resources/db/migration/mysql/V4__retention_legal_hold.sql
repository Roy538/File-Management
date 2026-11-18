-- ManageEDocs V4: retention policies, legal holds, controlled disposition (directive 10.2).

CREATE TABLE retention_policy (
  id             BINARY(16)    NOT NULL,
  tenant_id      BINARY(16)    NOT NULL,
  name           VARCHAR(200)  NOT NULL,
  description    VARCHAR(1000) NULL,
  retain_for     VARCHAR(16)   NOT NULL,   -- ISO-8601 period, e.g. P7Y, P18M, P90D
  trigger_event  VARCHAR(16)   NOT NULL,
  action         VARCHAR(16)   NOT NULL,
  active         BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at     DATETIME(6)   NOT NULL,
  updated_at     DATETIME(6)   NOT NULL,
  version        BIGINT        NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT uk_retention_policy_name UNIQUE (tenant_id, name),
  CONSTRAINT fk_retention_policy_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT ck_retention_policy_trigger CHECK (trigger_event IN ('CREATED','LAST_MODIFIED')),
  CONSTRAINT ck_retention_policy_action CHECK (action IN ('ARCHIVE','DESTROY'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Policy assignment: a document type's policy wins over its cabinet's.
ALTER TABLE cabinet ADD COLUMN retention_policy_id BINARY(16) NULL,
  ADD CONSTRAINT fk_cabinet_retention_policy FOREIGN KEY (retention_policy_id) REFERENCES retention_policy (id);
ALTER TABLE document_type ADD COLUMN retention_policy_id BINARY(16) NULL,
  ADD CONSTRAINT fk_document_type_retention_policy FOREIGN KEY (retention_policy_id) REFERENCES retention_policy (id);

-- Set when a disposition run destroys the document: binaries are purged, the row stays as evidence.
ALTER TABLE document ADD COLUMN destroyed_at DATETIME(6) NULL;
ALTER TABLE document ADD COLUMN archived_at DATETIME(6) NULL;

CREATE TABLE legal_hold (
  id              BINARY(16)    NOT NULL,
  tenant_id       BINARY(16)    NOT NULL,
  name            VARCHAR(200)  NOT NULL,
  reason          VARCHAR(1000) NOT NULL,
  matter_ref      VARCHAR(100)  NULL,
  created_by      BINARY(16)    NOT NULL,
  released_at     DATETIME(6)   NULL,
  released_by     BINARY(16)    NULL,
  release_reason  VARCHAR(1000) NULL,
  created_at      DATETIME(6)   NOT NULL,
  updated_at      DATETIME(6)   NOT NULL,
  version         BIGINT        NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_legal_hold_active (tenant_id, released_at),
  CONSTRAINT fk_legal_hold_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT fk_legal_hold_creator FOREIGN KEY (created_by) REFERENCES app_user (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE legal_hold_document (
  legal_hold_id  BINARY(16)  NOT NULL,
  document_id    BINARY(16)  NOT NULL,
  tenant_id      BINARY(16)  NOT NULL,
  added_by       BINARY(16)  NOT NULL,
  added_at       DATETIME(6) NOT NULL,
  PRIMARY KEY (legal_hold_id, document_id),
  KEY ix_legal_hold_document (tenant_id, document_id),
  CONSTRAINT fk_lhd_hold FOREIGN KEY (legal_hold_id) REFERENCES legal_hold (id),
  CONSTRAINT fk_lhd_document FOREIGN KEY (document_id) REFERENCES document (id),
  CONSTRAINT fk_lhd_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Destruction is never automatic: the system proposes a run, a records manager approves it.
CREATE TABLE disposition_run (
  id           BINARY(16)  NOT NULL,
  tenant_id    BINARY(16)  NOT NULL,
  status       VARCHAR(16) NOT NULL,
  proposed_at  DATETIME(6) NOT NULL,
  decided_by   BINARY(16)  NULL,
  decided_at   DATETIME(6) NULL,
  executed_at  DATETIME(6) NULL,
  created_at   DATETIME(6) NOT NULL,
  updated_at   DATETIME(6) NOT NULL,
  version      BIGINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_disposition_run_status (tenant_id, status),
  CONSTRAINT fk_disposition_run_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT ck_disposition_run_status CHECK (status IN ('PROPOSED','EXECUTED','CANCELLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE disposition_item (
  id                   BINARY(16)   NOT NULL,
  tenant_id            BINARY(16)   NOT NULL,
  disposition_run_id   BINARY(16)   NOT NULL,
  document_id          BINARY(16)   NOT NULL,
  retention_policy_id  BINARY(16)   NOT NULL,
  due_at               DATETIME(6)  NOT NULL,
  outcome              VARCHAR(16)  NOT NULL,
  note                 VARCHAR(500) NULL,
  PRIMARY KEY (id),
  CONSTRAINT uk_disposition_item UNIQUE (disposition_run_id, document_id),
  KEY ix_disposition_item_tenant (tenant_id),
  CONSTRAINT fk_disposition_item_run FOREIGN KEY (disposition_run_id) REFERENCES disposition_run (id),
  CONSTRAINT fk_disposition_item_document FOREIGN KEY (document_id) REFERENCES document (id),
  CONSTRAINT fk_disposition_item_policy FOREIGN KEY (retention_policy_id) REFERENCES retention_policy (id),
  CONSTRAINT ck_disposition_item_outcome CHECK (outcome IN ('PENDING','DESTROYED','SKIPPED_HOLD','SKIPPED_CHANGED','SKIPPED_EXCLUDED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
