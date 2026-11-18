-- ManageEDocs V6: physical file tracking (ported from the legacy system's Part A).
-- A physical file is a paper jacket in the registry; it is lent to departments (dispatch) and
-- comes back (return). Every change is recorded in an append-only movement log.

CREATE TABLE physical_file (
  id               BINARY(16)   NOT NULL,
  tenant_id        BINARY(16)   NOT NULL,
  file_number      VARCHAR(64)  NOT NULL,
  customer_name    VARCHAR(200) NOT NULL,
  department_id    BINARY(16)   NULL,          -- owning branch / department
  date_opened      DATE         NOT NULL,
  volume_number    INT          NOT NULL DEFAULT 1,
  status           VARCHAR(16)  NOT NULL,
  current_location VARCHAR(200) NULL,
  home_location    VARCHAR(200) NULL,          -- where the file belongs when it is in the registry
  created_at       DATETIME(6)  NOT NULL,
  updated_at       DATETIME(6)  NOT NULL,
  version          BIGINT       NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  -- The same number may exist in two organisations; within one it identifies a file and volume.
  CONSTRAINT uk_physical_file_number UNIQUE (tenant_id, file_number, volume_number),
  KEY ix_physical_file_status (tenant_id, status),
  KEY ix_physical_file_customer (tenant_id, customer_name),
  CONSTRAINT fk_physical_file_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT fk_physical_file_department FOREIGN KEY (department_id) REFERENCES department (id),
  CONSTRAINT ck_physical_file_status CHECK (status IN ('AVAILABLE','DISPATCHED','RETURNED','ARCHIVED','MISSING')),
  CONSTRAINT ck_physical_file_volume CHECK (volume_number >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One row per loan. The return is recorded on the same row (a loan has at most one return), so a
-- file can never have two open loans: open = returned_at IS NULL, enforced by the service under a
-- row lock on the file.
CREATE TABLE file_dispatch (
  id                         BINARY(16)    NOT NULL,
  tenant_id                  BINARY(16)    NOT NULL,
  file_id                    BINARY(16)    NOT NULL,
  dispatched_by              BINARY(16)    NOT NULL,
  authorised_by              BINARY(16)    NULL,
  dispatched_to              VARCHAR(200)  NOT NULL,   -- the person who took the file
  department                 VARCHAR(200)  NOT NULL,
  reason                     VARCHAR(1000) NULL,
  dispatched_at              DATETIME(6)   NOT NULL,
  expected_return_on         DATE          NULL,
  request_id                 BINARY(16)    NULL,
  returned_at                DATETIME(6)   NULL,
  received_by                BINARY(16)    NULL,
  returned_by_name           VARCHAR(200)  NULL,
  return_condition           VARCHAR(16)   NULL,
  returned_to_correct_location BOOLEAN     NULL,
  return_location            VARCHAR(200)  NULL,
  return_notes               VARCHAR(1000) NULL,
  overdue_notified_on        DATE          NULL,      -- de-duplicates the daily overdue alert
  created_at                 DATETIME(6)   NOT NULL,
  updated_at                 DATETIME(6)   NOT NULL,
  version                    BIGINT        NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_file_dispatch_file (tenant_id, file_id, dispatched_at),
  KEY ix_file_dispatch_open (tenant_id, returned_at, expected_return_on),
  KEY ix_file_dispatch_dates (tenant_id, dispatched_at),
  CONSTRAINT fk_file_dispatch_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT fk_file_dispatch_file FOREIGN KEY (file_id) REFERENCES physical_file (id),
  CONSTRAINT fk_file_dispatch_by FOREIGN KEY (dispatched_by) REFERENCES app_user (id),
  CONSTRAINT fk_file_dispatch_authorised FOREIGN KEY (authorised_by) REFERENCES app_user (id),
  CONSTRAINT fk_file_dispatch_received FOREIGN KEY (received_by) REFERENCES app_user (id),
  CONSTRAINT ck_file_dispatch_condition CHECK (return_condition IS NULL OR return_condition IN ('GOOD','WORN','DAMAGED','INCOMPLETE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE file_movement (
  id             BINARY(16)    NOT NULL,
  tenant_id      BINARY(16)    NOT NULL,
  file_id        BINARY(16)    NOT NULL,
  action         VARCHAR(20)   NOT NULL,
  performed_by   BINARY(16)    NULL,
  department     VARCHAR(200)  NULL,
  from_location  VARCHAR(200)  NULL,
  to_location    VARCHAR(200)  NULL,
  notes          VARCHAR(1000) NULL,
  occurred_at    DATETIME(6)   NOT NULL,
  PRIMARY KEY (id),
  KEY ix_file_movement_file (tenant_id, file_id, occurred_at),
  KEY ix_file_movement_time (tenant_id, occurred_at),
  CONSTRAINT fk_file_movement_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT fk_file_movement_file FOREIGN KEY (file_id) REFERENCES physical_file (id),
  CONSTRAINT ck_file_movement_action CHECK (action IN ('CREATED','DISPATCHED','RETURNED','RELOCATED','ARCHIVED','FLAGGED_MISSING','RECOVERED','UPDATED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE file_request (
  id              BINARY(16)    NOT NULL,
  tenant_id       BINARY(16)    NOT NULL,
  file_id         BINARY(16)    NOT NULL,
  requested_by    BINARY(16)    NOT NULL,
  department      VARCHAR(200)  NOT NULL,
  purpose         VARCHAR(1000) NULL,
  needed_by       DATE          NULL,
  status          VARCHAR(16)   NOT NULL,
  decided_by      BINARY(16)    NULL,
  decided_at      DATETIME(6)   NULL,
  decision_notes  VARCHAR(1000) NULL,
  dispatch_id     BINARY(16)    NULL,
  created_at      DATETIME(6)   NOT NULL,
  updated_at      DATETIME(6)   NOT NULL,
  version         BIGINT        NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_file_request_status (tenant_id, status, created_at),
  KEY ix_file_request_requester (tenant_id, requested_by, created_at),
  CONSTRAINT fk_file_request_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT fk_file_request_file FOREIGN KEY (file_id) REFERENCES physical_file (id),
  CONSTRAINT fk_file_request_requester FOREIGN KEY (requested_by) REFERENCES app_user (id),
  CONSTRAINT fk_file_request_dispatch FOREIGN KEY (dispatch_id) REFERENCES file_dispatch (id),
  CONSTRAINT ck_file_request_status CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED','FULFILLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
