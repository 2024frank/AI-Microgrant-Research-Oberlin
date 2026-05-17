-- ============================================================
-- AI Community Calendar Aggregator — MySQL 8 Schema
-- Database: oberlin-calendar | Host: DigitalOcean NYC3
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ------------------------------------------------------------
-- 1. SOURCES
--    Admin adds with: name + agent_id + schedule_cron.
--    agent_id is the only thing unique per source.
--    Environment + vault are shared across all agents via env vars.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sources (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name                 VARCHAR(120) NOT NULL,
  slug                 VARCHAR(80)  NOT NULL UNIQUE,
  agent_id             VARCHAR(120) NOT NULL UNIQUE,         -- unique Claude agent ID from Anthropic console
  schedule_cron        VARCHAR(50)  NOT NULL DEFAULT '0 6 * * *',
  calendar_source_name VARCHAR(120) NOT NULL,                -- label shown in CommunityHub
  active               TINYINT(1)  NOT NULL DEFAULT 1,
  created_at           DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ------------------------------------------------------------
-- 2. USERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  firebase_uid  VARCHAR(128) NOT NULL UNIQUE,
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
--    One row per scheduled or manual execution.
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
--    Everything agents extract. Field names mirror CommunityHub payload.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw_events (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_id             INT UNSIGNED    NOT NULL,
  agent_run_id          BIGINT UNSIGNED NOT NULL,
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
  ingested_post_url     TEXT                              NULL,   -- APP_URL/events/{id}, set after insert
  geo_scope             ENUM('hyper_local','city_wide','county','regional') NULL,
  geo_json              JSON                              NULL,
  status                ENUM('pending','approved','rejected','resubmitted') NOT NULL DEFAULT 'pending',
  communityhub_post_id  VARCHAR(80)                       NULL,
  created_at            DATETIME                          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME                          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_raw_source FOREIGN KEY (source_id)    REFERENCES sources(id)    ON DELETE CASCADE,
  CONSTRAINT fk_raw_run    FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_raw_status  ON raw_events(status);
CREATE INDEX idx_raw_source  ON raw_events(source_id);
CREATE INDEX idx_raw_created ON raw_events(created_at);


-- ------------------------------------------------------------
-- 6. REJECTION LOG
--    Fed back into agent prompts as few-shot learning examples.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rejection_log (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  raw_event_id   BIGINT UNSIGNED NOT NULL,
  source_id      INT UNSIGNED    NOT NULL,
  reviewer_id    INT UNSIGNED    NULL,
  reason_codes   JSON            NOT NULL,
  reviewer_note  TEXT            NULL,
  event_title    VARCHAR(60)     NOT NULL,
  event_snapshot JSON            NOT NULL,   -- full payload at rejection time for agent learning
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rej_raw    FOREIGN KEY (raw_event_id) REFERENCES raw_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_rej_source FOREIGN KEY (source_id)    REFERENCES sources(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_rej_source  ON rejection_log(source_id);
CREATE INDEX idx_rej_created ON rejection_log(created_at);


-- ------------------------------------------------------------
-- 7. FIELD EDIT LOG
--    Every field a reviewer edits before approving.
--    Core research benchmarking: measures per-field extraction accuracy.
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
