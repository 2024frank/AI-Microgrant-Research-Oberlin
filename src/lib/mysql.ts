import "server-only";
import mysql from "mysql2/promise";

let pool: mysql.Pool | null = null;
let schemaReady: Promise<void> | null = null;

function readEnv() {
  return {
    host: process.env.DATABASE_HOST ?? process.env.HOST,
    port: Number(process.env.DATABASE_PORT ?? process.env.PORT ?? 3306),
    user: process.env.DATABASE_USERNAME ?? process.env.USERNAME,
    password: process.env.DATABASE_PASSWORD ?? process.env.PASSWORD,
    database: process.env.DATABASE_NAME ?? process.env.DATABASE,
  };
}

export function getMysqlPool() {
  if (pool) return pool;
  const env = readEnv();
  const missing = Object.entries(env)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Missing MySQL env: ${missing.join(", ")}`);
  }

  pool = mysql.createPool({
    ...env,
    waitForConnections: true,
    connectionLimit: 8,
    queueLimit: 0,
    ssl: { rejectUnauthorized: false },
  });
  return pool;
}

export function json<T>(value: T): string {
  return JSON.stringify(value ?? null);
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

export async function ensureMysqlSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const db = getMysqlPool();
    await db.query(`
      CREATE TABLE IF NOT EXISTS sources (
        id VARCHAR(191) PRIMARY KEY,
        data JSON NOT NULL,
        schedule VARCHAR(32) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(data, '$.schedule'))) STORED,
        next_run BIGINT GENERATED ALWAYS AS (CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.nextRun')) AS UNSIGNED)) STORED,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS pipeline_jobs (
        id VARCHAR(191) PRIMARY KEY,
        data JSON NOT NULL,
        status VARCHAR(32) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(data, '$.status'))) STORED,
        started_at BIGINT GENERATED ALWAYS AS (CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.startedAt')) AS UNSIGNED)) STORED,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_pipeline_jobs_started_at (started_at),
        INDEX idx_pipeline_jobs_status (status)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS review_posts (
        id VARCHAR(191) PRIMARY KEY,
        data JSON NOT NULL,
        status VARCHAR(32) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(data, '$.status'))) STORED,
        created_at BIGINT GENERATED ALWAYS AS (CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.createdAt')) AS UNSIGNED)) STORED,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_review_posts_created_at (created_at),
        INDEX idx_review_posts_status (status)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS duplicate_groups (
        id VARCHAR(191) PRIMARY KEY,
        data JSON NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS processed_event_ids (
        id VARCHAR(191) PRIMARY KEY,
        processed_at BIGINT NOT NULL
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS post_feedback (
        id VARCHAR(191) PRIMARY KEY,
        data JSON NOT NULL,
        reviewed_at BIGINT GENERATED ALWAYS AS (CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.reviewedAt')) AS UNSIGNED)) STORED,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_post_feedback_reviewed_at (reviewed_at)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS ai_learning_events (
        id VARCHAR(191) PRIMARY KEY,
        data JSON NOT NULL,
        post_id VARCHAR(191) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(data, '$.postId'))) STORED,
        learning_signal VARCHAR(64) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(data, '$.signal'))) STORED,
        created_at BIGINT GENERATED ALWAYS AS (CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.createdAt')) AS UNSIGNED)) STORED,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ai_learning_post_id (post_id),
        INDEX idx_ai_learning_signal (learning_signal),
        INDEX idx_ai_learning_created_at (created_at)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS source_builder_sessions (
        id VARCHAR(191) PRIMARY KEY,
        data JSON NOT NULL,
        status VARCHAR(32) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(data, '$.status'))) STORED,
        created_at BIGINT GENERATED ALWAYS AS (CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.createdAt')) AS UNSIGNED)) STORED,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_source_builder_created_at (created_at),
        INDEX idx_source_builder_status (status)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id VARCHAR(191) PRIMARY KEY,
        data JSON NOT NULL,
        email VARCHAR(191) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(data, '$.email'))) STORED,
        role VARCHAR(32) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(data, '$.role'))) STORED,
        status VARCHAR(32) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(data, '$.status'))) STORED,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_app_users_email (email),
        INDEX idx_app_users_status (status)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS access_requests (
        id VARCHAR(191) PRIMARY KEY,
        data JSON NOT NULL,
        status VARCHAR(32) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(data, '$.status'))) STORED,
        requested_at BIGINT GENERATED ALWAYS AS (CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.requestedAt')) AS UNSIGNED)) STORED,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_access_requests_status (status),
        INDEX idx_access_requests_requested_at (requested_at)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS team_chat_messages (
        id VARCHAR(191) PRIMARY KEY,
        data JSON NOT NULL,
        created_at BIGINT GENERATED ALWAYS AS (CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.createdAt')) AS UNSIGNED)) STORED,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_team_chat_created_at (created_at)
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS source_configs (
        id VARCHAR(191) PRIMARY KEY,
        data JSON NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS source_builder_ui_chats (
        id VARCHAR(191) PRIMARY KEY,
        data JSON NOT NULL,
        created_by VARCHAR(191) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(data, '$.createdBy'))) STORED,
        created_at BIGINT GENERATED ALWAYS AS (CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.createdAt')) AS UNSIGNED)) STORED,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_sb_ui_chats_user_created (created_by, created_at)
      )
    `);
  })();
  return schemaReady;
}
