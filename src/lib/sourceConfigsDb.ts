import "server-only";

import type { SourceConfig } from "./sourceConfig";
import { ensureMysqlSchema, getMysqlPool, json, parseJson } from "./mysql";

export async function upsertSourceConfigRecord(config: SourceConfig & Record<string, unknown>): Promise<void> {
  await ensureMysqlSchema();
  const id = String(config.id ?? "");
  if (!id) throw new Error("source config id required");
  const payload = { ...config, updatedAt: Date.now() };
  await getMysqlPool().execute(
    `INSERT INTO source_configs (id, data) VALUES (?, CAST(? AS JSON))
     ON DUPLICATE KEY UPDATE data = VALUES(data)`,
    [id, json(payload)]
  );
}

export async function getSourceConfigRecord(id: string): Promise<SourceConfig | null> {
  await ensureMysqlSchema();
  const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(
    "SELECT data FROM source_configs WHERE id = ? LIMIT 1",
    [id]
  );
  if (!rows[0]) return null;
  return parseJson<SourceConfig>(rows[0].data, null as unknown as SourceConfig);
}

export async function listSourceConfigRecords(): Promise<SourceConfig[]> {
  await ensureMysqlSchema();
  const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(
    "SELECT data FROM source_configs ORDER BY updated_at DESC LIMIT 500"
  );
  return rows.map((row) => parseJson<SourceConfig>(row.data, null as unknown as SourceConfig));
}

export async function deleteSourceConfigRecord(id: string): Promise<void> {
  await ensureMysqlSchema();
  await getMysqlPool().execute("DELETE FROM source_configs WHERE id = ?", [id]);
}

export async function mergeSourceConfigRecord(id: string, updates: Partial<SourceConfig>): Promise<void> {
  const existing = await getSourceConfigRecord(id);
  if (!existing) return;
  await upsertSourceConfigRecord({ ...existing, ...updates } as SourceConfig & Record<string, unknown>);
}
