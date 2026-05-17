-- ============================================================
-- AI Community Calendar Aggregator — MySQL 8 Schema
-- Database: oberlin-calendar | Host: DigitalOcean NYC3
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ------------------------------------------------------------
-- 1. SOURCES
--    One row per org. Admin adds with just name + agent_id.
--    All agents share the same environment/vault from env vars.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sources (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name                 VARCHAR(120) NOT NULL,
  slug                 VARCHAR(80)  NOT NULL UNIQUE,
  agent_id             VARCHAR(120) NOT NULL,              -- Claude agent ID (unique per source)
  agent_config         JSON         NULL,                  -- { agent_id, environment_id, vault_id }
  calendar_source_name VARCHAR(120) NOT NULL,              -- displayed in CommunityHub as source label
  schedule_cron        VARCHAR(50)  NOT NULL DEFAULT '0 6 * * *',
  active               TINYINT(1)  NOT NULL DEFAULT 1,
  created_at           DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ------------------------------------------------------------
-- 2. USERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  firebase_uid  VARCHAR(128) NOT NULL UNIQUE,             -- Firebase UID (links to Firebase Auth)
  email         VARCHAR(150) NOT NULL UNIQUE,
  full_name     VARCHAR(120) NOT NULL,
  role          ENUM('admin','reviewer') NOT NULL DEFAULT 'reviewer',
  active        TINYINT(1)  NOT NULL DEFAULT 1,
  created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ------------------------------------------------------------
-- 3. REVIEWER SOURCE ASSIGNMENTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviewer_sources (
  reviewer_id INT UNSIGNED NOT NULL,
  source_id   INT UNSIGNED NOT NULL,
  assigned_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (reviewer_id, source_id),
  CONSTRAINT fk_rs_reviewer FOREIGN KEY (reviewer_id) REFERENCES users(id)   ON DELETE CASCADE,
  CONSTRAINT fk_rs_source   FOREIGN KEY (source_id)   REFERENCES sources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ------------------------------------------------------------
-- 4. AGENT RUNS
--    One row per scheduled execution. Powers admin dashboard.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_runs (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_id           INT UNSIGNED    NOT NULL,
  started_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at         DATETIME        NULL,
  status              ENUM('running','completed','failed') NOT NULL DEFAULT 'running',
  events_found        INT UNSIGNED    NOT NULL DEFAULT 0,
  events_extracted    INT UNSIGNED    NOT NULL DEFAULT 0,
  events_skipped_dup  INT UNSIGNED    NOT NULL DEFAULT 0,
  events_errored      INT UNSIGNED    NOT NULL DEFAULT 0,
  communityhub_dup    INT UNSIGNED    NOT NULL DEFAULT 0,
  system_dup          INT UNSIGNED    NOT NULL DEFAULT 0,
  prompt_tokens       INT UNSIGNED    NULL,
  completion_tokens   INT UNSIGNED    NULL,
  error_log           JSON            NULL,
  CONSTRAINT fk_run_source FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_run_source  ON agent_runs(source_id);
CREATE INDEX idx_run_started ON agent_runs(started_at);
CREATE INDEX idx_run_status  ON agent_runs(status);


-- ------------------------------------------------------------
-- 5. RAW EVENTS
--    All agent-extracted events. Field names mirror CommunityHub payload.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw_events (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_id             INT UNSIGNED    NOT NULL,
  agent_run_id          BIGINT UNSIGNED NOT NULL,

  -- CommunityHub payload fields
  event_type            ENUM('ot','an','jp')              NOT NULL DEFAULT 'ot',
  title                 VARCHAR(60)                       NOT NULL,
  description           VARCHAR(200)                      NOT NULL,
  extended_description  VARCHAR(1000)                     NULL,
  sponsors              JSON                              NOT NULL,
  post_type_ids         JSON                              NOT NULL,
  sessions              JSON                              NOT NULL,
  location_type         ENUM('ph2','on','bo','ne')        NOT NULL DEFAULT 'ne',
  location              VARCHAR(255)                      NULL,
  place_id              VARCHAR(120)                      NULL,
  place_name            VARCHAR(120)                      NULL,
  room_num              VARCHAR(80)                       NULL,
  url_link              TEXT                              NULL,
  display               ENUM('all','ps','sps','ss')       NOT NULL DEFAULT 'all',
  screen_ids            JSON                              NULL,
  buttons               JSON                              NULL,
  contact_email         VARCHAR(150)                      NULL,
  phone                 VARCHAR(30)                       NULL,
  website               TEXT                              NULL,
  image_cdn_url         TEXT                              NULL,
  calendar_source_name  VARCHAR(120)                      NULL,
  calendar_source_url   TEXT                              NULL,
  ingested_post_url     TEXT                              NULL,   -- set after insert: APP_URL/events/{id}

  -- Classification
  geo_scope             ENUM('hyper_local','city_wide','county','regional') NULL,
  geo_json              JSON                              NULL,

  -- Status
  status                ENUM('pending','approved','rejected','resubmitted') NOT NULL DEFAULT 'pending',
  communityhub_post_id  VARCHAR(80)                       NULL,
  created_at            DATETIME                          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME                          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_raw_source FOREIGN KEY (source_id)    REFERENCES sources(id)    ON DELETE CASCADE,
  CONSTRAINT fk_raw_run    FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_raw_status  ON raw_events(status);
CREATE INDEX idx_raw_source  ON raw_events(source_id);
CREATE INDEX idx_raw_run     ON raw_events(agent_run_id);
CREATE INDEX idx_raw_created ON raw_events(created_at);


-- ------------------------------------------------------------
-- 6. REJECTION LOG
--    Structured rejection data fed back into agent prompts.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rejection_log (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  raw_event_id   BIGINT UNSIGNED NOT NULL,
  source_id      INT UNSIGNED    NOT NULL,
  reviewer_id    INT UNSIGNED    NULL,
  reason_codes   JSON            NOT NULL,   -- e.g. ["bad_date_parse","wrong_audience"]
  reviewer_note  TEXT            NULL,
  event_title    VARCHAR(60)     NOT NULL,
  event_snapshot JSON            NOT NULL,   -- full payload at rejection time
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_rej_raw    FOREIGN KEY (raw_event_id) REFERENCES raw_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_rej_source FOREIGN KEY (source_id)    REFERENCES sources(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_rej_source  ON rejection_log(source_id);
CREATE INDEX idx_rej_created ON rejection_log(created_at);

-- Valid reason_codes:
-- wrong_audience | bad_date_parse | duplicate_missed | description_hallucinated
-- missing_fields | wrong_geo_scope | not_public_event | wrong_post_type | bad_location | other


-- ------------------------------------------------------------
-- 7. FIELD EDIT LOG
--    Every field a reviewer edits before approving.
--    Core research benchmarking data.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS field_edit_log (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  raw_event_id BIGINT UNSIGNED NOT NULL,
  source_id    INT UNSIGNED    NOT NULL,
  reviewer_id  INT UNSIGNED    NULL,
  field_name   VARCHAR(60)     NOT NULL,
  old_value    TEXT            NULL,
  new_value    TEXT            NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_edit_raw    FOREIGN KEY (raw_event_id) REFERENCES raw_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_edit_source FOREIGN KEY (source_id)    REFERENCES sources(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_edit_source ON field_edit_log(source_id);
CREATE INDEX idx_edit_field  ON field_edit_log(field_name);


-- ------------------------------------------------------------
-- 8. REVIEW SESSIONS
--    One row per reviewer action. Links all research data.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS review_sessions (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  raw_event_id    BIGINT UNSIGNED NOT NULL,
  reviewer_id     INT UNSIGNED    NULL,
  action          ENUM('approved','rejected') NOT NULL,
  time_spent_sec  INT UNSIGNED    NULL,
  submitted_to_ch TINYINT(1)     NOT NULL DEFAULT 0,
  ch_response     JSON            NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_rsess_raw FOREIGN KEY (raw_event_id) REFERENCES raw_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_rsess_action  ON review_sessions(action);
CREATE INDEX idx_rsess_created ON review_sessions(created_at);

SET FOREIGN_KEY_CHECKS = 1;
