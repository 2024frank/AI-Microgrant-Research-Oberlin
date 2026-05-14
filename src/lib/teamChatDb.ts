import "server-only";

import { randomUUID } from "crypto";
import { ensureMysqlSchema, getMysqlPool, json, parseJson } from "./mysql";

export type TeamChatMessageRow = {
  id: string;
  text: string;
  senderEmail: string;
  senderName: string;
  senderPhoto: string | null;
  mentions: string[];
  createdAt: number;
};

export async function listTeamChatMessages(limit: number): Promise<TeamChatMessageRow[]> {
  await ensureMysqlSchema();
  const cap = Math.max(1, Math.min(limit, 500));
  const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(
    `SELECT data FROM team_chat_messages ORDER BY created_at DESC LIMIT ${cap}`
  );
  return rows.map((row) =>
    parseJson<TeamChatMessageRow>(row.data, null as unknown as TeamChatMessageRow)
  );
}

export async function insertTeamChatMessage(
  msg: Omit<TeamChatMessageRow, "id" | "createdAt">
): Promise<TeamChatMessageRow> {
  await ensureMysqlSchema();
  const id = randomUUID();
  const createdAt = Date.now();
  const row: TeamChatMessageRow = { ...msg, id, createdAt };
  await getMysqlPool().execute(
    `INSERT INTO team_chat_messages (id, data) VALUES (?, CAST(? AS JSON))`,
    [id, json(row)]
  );
  return row;
}
