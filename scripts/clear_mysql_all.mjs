/**
 * Wipes all Civic Calendar MySQL tables (including processed_event_ids and sources),
 * then re-inserts the default Localist source. Reads DATABASE_* from ../.env
 *
 * Usage: node scripts/clear_mysql_all.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(envPath) {
  const env = {};
  if (!fs.existsSync(envPath)) throw new Error(`Missing env file: ${envPath}`);
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const eq = s.indexOf("=");
    if (eq < 1) continue;
    const key = s.slice(0, eq).trim();
    let val = s.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const TABLES = [
  "review_posts",
  "duplicate_groups",
  "processed_event_ids",
  "pipeline_jobs",
  "post_feedback",
  "ai_learning_events",
  "source_builder_sessions",
  "sources",
  "app_users",
  "access_requests",
  "team_chat_messages",
  "source_configs",
  "source_builder_ui_chats",
];

const DEFAULT_SOURCE = {
  id: "localist-oberlin",
  name: "Localist – Oberlin College Calendar",
  type: "localist",
  baseUrl: "https://calendar.oberlin.edu",
  schedule: "off",
  enabled: true,
  createdAt: Date.now(),
};

async function main() {
  const env = loadEnv(path.join(__dirname, "..", ".env"));
  const cfg = {
    host: env.DATABASE_HOST ?? env.HOST,
    port: Number(env.DATABASE_PORT ?? env.PORT ?? 3306),
    user: env.DATABASE_USERNAME ?? env.USERNAME,
    password: env.DATABASE_PASSWORD ?? env.PASSWORD,
    database: env.DATABASE_NAME ?? env.DATABASE,
    ssl: { rejectUnauthorized: false },
  };
  if (!cfg.host || !cfg.user || !cfg.password || !cfg.database) {
    throw new Error("Missing DATABASE_HOST, DATABASE_USERNAME, DATABASE_PASSWORD, or DATABASE_NAME in .env");
  }

  const conn = await mysql.createConnection(cfg);
  let total = 0;
  for (const table of TABLES) {
    try {
      const [result] = await conn.execute(`DELETE FROM ${table}`);
      const n = Number(result?.affectedRows ?? 0);
      total += n;
      console.log(`${table}: ${n} rows deleted`);
    } catch (err) {
      console.warn(`${table}: ${err instanceof Error ? err.message : err}`);
    }
  }

  await conn.execute(
    "INSERT IGNORE INTO sources (id, data) VALUES (?, CAST(? AS JSON))",
    [DEFAULT_SOURCE.id, JSON.stringify(DEFAULT_SOURCE)]
  );
  console.log(`Re-seeded default source: ${DEFAULT_SOURCE.id}`);
  await conn.end();
  console.log(`Total rows deleted: ${total}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
