import fs from "node:fs/promises";
import path from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import mysql from "mysql2/promise";

const COLLECTIONS = [
  "sources",
  "pipelineJobs",
  "reviewPosts",
  "duplicateGroups",
  "processedEventIds",
  "postFeedback",
  "users",
  "accessRequests",
];

const TABLES = [
  "source_builder_sessions",
  "post_feedback",
  "ai_learning_events",
  "processed_event_ids",
  "duplicate_groups",
  "review_posts",
  "pipeline_jobs",
  "sources",
  "access_requests",
  "app_users",
];

function initFirestore() {
  if (getApps().length) return getFirestore();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is missing");
  initializeApp({ credential: cert(JSON.parse(raw)) });
  return getFirestore();
}

function mysqlEnv() {
  return {
    host: process.env.DATABASE_HOST ?? process.env.HOST,
    port: Number(process.env.DATABASE_PORT ?? process.env.PORT ?? 3306),
    user: process.env.DATABASE_USERNAME ?? process.env.USERNAME,
    password: process.env.DATABASE_PASSWORD ?? process.env.PASSWORD,
    database: process.env.DATABASE_NAME ?? process.env.DATABASE,
    ssl: { rejectUnauthorized: false },
  };
}

function normalize(value) {
  if (value == null) return value;
  if (typeof value !== "object") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value.path === "string" && value.firestore) return value.path;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, normalize(item)])
  );
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

async function ensureSchema(db) {
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
}

async function readFirestoreCollections(firestore) {
  const backup = {};
  for (const name of COLLECTIONS) {
    const snap = await firestore.collection(name).get();
    backup[name] = snap.docs.map((doc) => ({
      id: doc.id,
      data: normalize(doc.data()),
    }));
  }
  return backup;
}

async function clearMysql(db) {
  await db.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of TABLES) {
    await db.query(`DELETE FROM ${table}`);
  }
  await db.query("SET FOREIGN_KEY_CHECKS = 1");
}

async function upsertJson(db, table, id, data) {
  await db.execute(
    `INSERT INTO ${table} (id, data)
     VALUES (?, CAST(? AS JSON))
     ON DUPLICATE KEY UPDATE data = VALUES(data)`,
    [id, JSON.stringify(data)]
  );
}

async function migrateToMysql(db, backup) {
  const counts = {};

  for (const { id, data } of backup.sources) {
    await upsertJson(db, "sources", data.id ?? id, { id, ...data });
  }
  counts.sources = backup.sources.length;

  for (const { id, data } of backup.pipelineJobs) {
    await upsertJson(db, "pipeline_jobs", id, { id, ...data });
  }
  counts.pipelineJobs = backup.pipelineJobs.length;

  for (const { id, data } of backup.reviewPosts) {
    await upsertJson(db, "review_posts", data.id ?? id, { id, ...data });
  }
  counts.reviewPosts = backup.reviewPosts.length;

  for (const { id, data } of backup.duplicateGroups) {
    await upsertJson(db, "duplicate_groups", data.id ?? id, { id, ...data });
  }
  counts.duplicateGroups = backup.duplicateGroups.length;

  for (const { id, data } of backup.processedEventIds) {
    await db.execute(
      `INSERT INTO processed_event_ids (id, processed_at)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE processed_at = VALUES(processed_at)`,
      [id, Number(data.processedAt ?? data.processed_at ?? Date.now())]
    );
  }
  counts.processedEventIds = backup.processedEventIds.length;

  for (const { id, data } of backup.postFeedback) {
    await upsertJson(db, "post_feedback", data.id ?? id, { id, ...data });
  }
  counts.postFeedback = backup.postFeedback.length;

  for (const { id, data } of backup.users) {
    const email = normalizeEmail(data.email || id);
    await upsertJson(db, "app_users", email, { ...data, email });
  }
  counts.users = backup.users.length;

  for (const { id, data } of backup.accessRequests) {
    const email = normalizeEmail(data.email || id);
    await upsertJson(db, "access_requests", email, { id: email, ...data, email });
  }
  counts.accessRequests = backup.accessRequests.length;

  return counts;
}

async function mysqlCounts(db) {
  const countMap = {};
  for (const [key, table] of Object.entries({
    sources: "sources",
    pipelineJobs: "pipeline_jobs",
    reviewPosts: "review_posts",
    duplicateGroups: "duplicate_groups",
    processedEventIds: "processed_event_ids",
    postFeedback: "post_feedback",
    users: "app_users",
    accessRequests: "access_requests",
    sourceBuilderSessions: "source_builder_sessions",
  })) {
    const [rows] = await db.query(`SELECT COUNT(*) AS count FROM ${table}`);
    countMap[key] = Number(rows[0]?.count ?? 0);
  }
  return countMap;
}

async function clearFirestore(firestore) {
  const cleared = {};
  for (const name of COLLECTIONS) {
    let total = 0;
    while (true) {
      const snap = await firestore.collection(name).limit(400).get();
      if (snap.empty) break;
      const batch = firestore.batch();
      for (const doc of snap.docs) batch.delete(doc.ref);
      await batch.commit();
      total += snap.size;
    }
    cleared[name] = total;
  }
  return cleared;
}

async function main() {
  const shouldClearFirestore = process.argv.includes("--clear-firestore");
  const firestore = initFirestore();
  const db = await mysql.createConnection(mysqlEnv());
  await ensureSchema(db);

  const backup = await readFirestoreCollections(firestore);
  await fs.mkdir(path.resolve("migration-backups"), { recursive: true });
  const backupPath = path.resolve(
    "migration-backups",
    `firestore-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  await fs.writeFile(backupPath, JSON.stringify(backup, null, 2));

  await clearMysql(db);
  const migrated = await migrateToMysql(db, backup);
  const mysqlAfter = await mysqlCounts(db);

  let firestoreCleared = null;
  if (shouldClearFirestore) {
    firestoreCleared = await clearFirestore(firestore);
  }

  await db.end();

  console.log(
    JSON.stringify(
      {
        backupPath,
        migrated,
        mysqlAfter,
        firestoreCleared,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
