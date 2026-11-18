-- ManageEDocs V5: configurable approval workflows (ADR-009) and in-app notifications.
-- Definitions are versioned: editing a definition creates a new immutable version; running
-- instances stay pinned to the version they started with.

CREATE TABLE workflow_definition (
  id                  BINARY(16)    NOT NULL,
  tenant_id           BINARY(16)    NOT NULL,
  name                VARCHAR(200)  NOT NULL,
  description         VARCHAR(1000) NULL,
  active              BOOLEAN       NOT NULL DEFAULT TRUE,
  current_version_no  INT           NOT NULL,
  created_at          DATETIME(6)   NOT NULL,
  updated_at          DATETIME(6)   NOT NULL,
  version             BIGINT        NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT uk_workflow_definition_name UNIQUE (tenant_id, name),
  CONSTRAINT fk_workflow_definition_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE workflow_definition_version (
  id             BINARY(16)  NOT NULL,
  tenant_id      BINARY(16)  NOT NULL,
  definition_id  BINARY(16)  NOT NULL,
  version_no     INT         NOT NULL,
  created_by     BINARY(16)  NOT NULL,
  created_at     DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uk_workflow_definition_version UNIQUE (definition_id, version_no),
  CONSTRAINT fk_wdv_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT fk_wdv_definition FOREIGN KEY (definition_id) REFERENCES workflow_definition (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A step is decided either by any holder of a role (approval_mode ANY) or by named users
-- (ANY: first decision settles the step; ALL: every named user must approve).
CREATE TABLE workflow_step (
  id                     BINARY(16)   NOT NULL,
  tenant_id              BINARY(16)   NOT NULL,
  definition_version_id  BINARY(16)   NOT NULL,
  step_order             INT          NOT NULL,
  name                   VARCHAR(200) NOT NULL,
  approval_mode          VARCHAR(8)   NOT NULL,
  assignee_role          VARCHAR(32)  NULL,
  due_days               INT          NULL,
  PRIMARY KEY (id),
  CONSTRAINT uk_workflow_step_order UNIQUE (definition_version_id, step_order),
  CONSTRAINT fk_workflow_step_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT fk_workflow_step_version FOREIGN KEY (definition_version_id) REFERENCES workflow_definition_version (id),
  CONSTRAINT ck_workflow_step_mode CHECK (approval_mode IN ('ANY','ALL')),
  CONSTRAINT ck_workflow_step_due CHECK (due_days IS NULL OR due_days >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE workflow_step_user (
  step_id    BINARY(16) NOT NULL,
  user_id    BINARY(16) NOT NULL,
  tenant_id  BINARY(16) NOT NULL,
  PRIMARY KEY (step_id, user_id),
  CONSTRAINT fk_wsu_step FOREIGN KEY (step_id) REFERENCES workflow_step (id),
  CONSTRAINT fk_wsu_user FOREIGN KEY (user_id) REFERENCES app_user (id),
  CONSTRAINT fk_wsu_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE workflow_instance (
  id                     BINARY(16)  NOT NULL,
  tenant_id              BINARY(16)  NOT NULL,
  definition_version_id  BINARY(16)  NOT NULL,
  document_id            BINARY(16)  NOT NULL,
  document_version_no    INT         NOT NULL,
  status                 VARCHAR(20) NOT NULL,
  current_step_order     INT         NOT NULL,
  initiated_by           BINARY(16)  NOT NULL,
  started_at             DATETIME(6) NOT NULL,
  completed_at           DATETIME(6) NULL,
  created_at             DATETIME(6) NOT NULL,
  updated_at             DATETIME(6) NOT NULL,
  version                BIGINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_workflow_instance_document (tenant_id, document_id, status),
  CONSTRAINT fk_workflow_instance_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT fk_workflow_instance_version FOREIGN KEY (definition_version_id) REFERENCES workflow_definition_version (id),
  CONSTRAINT fk_workflow_instance_document FOREIGN KEY (document_id) REFERENCES document (id),
  CONSTRAINT fk_workflow_instance_initiator FOREIGN KEY (initiated_by) REFERENCES app_user (id),
  CONSTRAINT ck_workflow_instance_status CHECK (status IN ('IN_PROGRESS','CHANGES_REQUESTED','APPROVED','REJECTED','CANCELLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE workflow_task (
  id                 BINARY(16)    NOT NULL,
  tenant_id          BINARY(16)    NOT NULL,
  instance_id        BINARY(16)    NOT NULL,
  step_order         INT           NOT NULL,
  step_name          VARCHAR(200)  NOT NULL,
  assignee_user_id   BINARY(16)    NULL,
  assignee_role      VARCHAR(32)   NULL,
  status             VARCHAR(20)   NOT NULL,
  decided_by         BINARY(16)    NULL,
  decided_at         DATETIME(6)   NULL,
  decision_comment   VARCHAR(2000) NULL,
  due_at             DATETIME(6)   NULL,
  escalated_at       DATETIME(6)   NULL,
  delegated_from     BINARY(16)    NULL,
  created_at         DATETIME(6)   NOT NULL,
  updated_at         DATETIME(6)   NOT NULL,
  version            BIGINT        NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_workflow_task_user (tenant_id, assignee_user_id, status),
  KEY ix_workflow_task_role (tenant_id, assignee_role, status),
  KEY ix_workflow_task_instance (instance_id, step_order),
  KEY ix_workflow_task_due (tenant_id, status, due_at),
  CONSTRAINT fk_workflow_task_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT fk_workflow_task_instance FOREIGN KEY (instance_id) REFERENCES workflow_instance (id),
  CONSTRAINT ck_workflow_task_assignee CHECK ((assignee_user_id IS NULL) <> (assignee_role IS NULL)),
  CONSTRAINT ck_workflow_task_status CHECK (status IN ('OPEN','APPROVED','REJECTED','CHANGES_REQUESTED','SUPERSEDED','CANCELLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Append-only transition history (who did what, when, with which comment).
CREATE TABLE workflow_event (
  id           BINARY(16)    NOT NULL,
  tenant_id    BINARY(16)    NOT NULL,
  instance_id  BINARY(16)    NOT NULL,
  task_id      BINARY(16)    NULL,
  action       VARCHAR(32)   NOT NULL,
  actor_id     BINARY(16)    NULL,
  from_status  VARCHAR(20)   NULL,
  to_status    VARCHAR(20)   NULL,
  comment      VARCHAR(2000) NULL,
  occurred_at  DATETIME(6)   NOT NULL,
  PRIMARY KEY (id),
  KEY ix_workflow_event_instance (instance_id, occurred_at),
  CONSTRAINT fk_workflow_event_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT fk_workflow_event_instance FOREIGN KEY (instance_id) REFERENCES workflow_instance (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE notification (
  id             BINARY(16)    NOT NULL,
  tenant_id      BINARY(16)    NOT NULL,
  user_id        BINARY(16)    NOT NULL,
  type           VARCHAR(48)   NOT NULL,
  title          VARCHAR(300)  NOT NULL,
  body           VARCHAR(1000) NULL,
  resource_type  VARCHAR(32)   NULL,
  resource_id    BINARY(16)    NULL,
  read_at        DATETIME(6)   NULL,
  created_at     DATETIME(6)   NOT NULL,
  PRIMARY KEY (id),
  KEY ix_notification_inbox (tenant_id, user_id, read_at, created_at),
  CONSTRAINT fk_notification_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES app_user (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
