import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";

export const dynamic = "force-dynamic";

function getDbEnv() {
  return {
    username: process.env.DATABASE_USERNAME ?? process.env.USERNAME,
    password: process.env.DATABASE_PASSWORD ?? process.env.PASSWORD,
    host: process.env.DATABASE_HOST ?? process.env.HOST,
    port: process.env.DATABASE_PORT ?? process.env.PORT,
    database: process.env.DATABASE_NAME ?? process.env.DATABASE,
  };
}

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (
    req.headers.get("x-debug-secret") === secret ||
    req.nextUrl.searchParams.get("secret") === secret
  );
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const env = getDbEnv();
  const missing = Object.entries(env)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, configured: false, missing },
      { status: 500 }
    );
  }

  let connection: mysql.Connection | null = null;

  try {
    connection = await mysql.createConnection({
      host: env.host,
      port: Number(env.port),
      user: env.username,
      password: env.password,
      database: env.database,
      connectTimeout: 8000,
      ssl: { rejectUnauthorized: false },
    });

    const [rows] = await connection.execute<mysql.RowDataPacket[]>(
      "SELECT 1 AS ok, DATABASE() AS database_name, VERSION() AS version"
    );

    const first = rows[0];

    const payload: Record<string, unknown> = {
      ok: first?.ok === 1,
      configured: true,
      host: env.host,
      port: Number(env.port),
      database: first?.database_name ?? null,
      version: first?.version ?? null,
    };

    if (req.nextUrl.searchParams.get("stats") === "1") {
      const [processedRows] = await connection.execute<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) AS c FROM processed_event_ids"
      );
      const [postRows] = await connection.execute<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) AS c FROM review_posts"
      );
      payload.stats = {
        processedEventIds: Number(processedRows[0]?.c ?? 0),
        reviewPosts: Number(postRows[0]?.c ?? 0),
      };
    }

    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        error: err instanceof Error ? err.message : "MySQL test failed",
      },
      { status: 500 }
    );
  } finally {
    await connection?.end().catch(() => undefined);
  }
}
