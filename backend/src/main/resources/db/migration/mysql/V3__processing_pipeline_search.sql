-- ManageEDocs V3: asynchronous processing pipeline (scan → extract → index) and full-text search.
--
-- processing_job doubles as the transactional outbox (ADR-007): a job row is inserted in the same
-- transaction as the document_version it processes, so a committed version always has a job and a
-- rolled-back upload never does. Workers claim rows with SELECT … FOR UPDATE SKIP LOCKED, so any
-- number of replicas share the queue without double-processing (reference-platform pattern).
-- Not a @TenantId table: the poller runs without a caller and claims across tenants; each job
-- carries its own tenant_id, which the worker pins before touching tenant data.

CREATE TABLE processing_job (
  id                   BINARY(16)    NOT NULL,
  tenant_id            BINARY(16)    NOT NULL,
  document_id          BINARY(16)    NOT NULL,
  document_version_id  BINARY(16)    NOT NULL,
  status               VARCHAR(16)   NOT NULL,
  attempts             INT           NOT NULL DEFAULT 0,
  next_attempt_at      DATETIME(6)   NOT NULL,
  claimed_at           DATETIME(6)   NULL,
  claimed_by           VARCHAR(64)   NULL,
  scan_result          VARCHAR(16)   NULL,
  extracted_chars      INT           NULL,
  last_error           VARCHAR(1000) NULL,
  created_at           DATETIME(6)   NOT NULL,
  updated_at           DATETIME(6)   NOT NULL,
  completed_at         DATETIME(6)   NULL,
  PRIMARY KEY (id),
  -- Idempotency: exactly one job per version; reprocessing resets it rather than adding another.
  CONSTRAINT uk_processing_job_version UNIQUE (document_version_id),
  KEY ix_processing_job_claim (status, next_attempt_at),
  KEY ix_processing_job_tenant (tenant_id, status),
  CONSTRAINT fk_processing_job_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT fk_processing_job_version FOREIGN KEY (document_version_id) REFERENCES document_version (id),
  CONSTRAINT ck_processing_job_status CHECK (status IN ('PENDING','RUNNING','DONE','DEAD')),
  CONSTRAINT ck_processing_job_scan CHECK (scan_result IS NULL OR scan_result IN ('CLEAN','INFECTED','SKIPPED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Extracted text per version (only the current version is searched). Kept out of document_version
-- so the immutable version row stays small and the text can be rebuilt by re-indexing.
CREATE TABLE document_text (
  document_version_id  BINARY(16)  NOT NULL,
  tenant_id            BINARY(16)  NOT NULL,
  document_id          BINARY(16)  NOT NULL,
  content              MEDIUMTEXT  NOT NULL,
  truncated            BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at           DATETIME(6) NOT NULL,
  PRIMARY KEY (document_version_id),
  KEY ix_document_text_document (tenant_id, document_id),
  FULLTEXT KEY ft_document_text_content (content),
  CONSTRAINT fk_document_text_version FOREIGN KEY (document_version_id) REFERENCES document_version (id),
  CONSTRAINT fk_document_text_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE document ADD FULLTEXT KEY ft_document_title (title);
