import "server-only";

import { randomUUID } from "crypto";
import { ensureMysqlSchema, getMysqlPool, json, parseJson } from "./mysql";

export type UiChatMsg = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  toolResults?: Array<{ tool: string; result: string }>;
};

export type UiChatSession = {
  id: string;
  title: string;
  createdBy: string;
  createdAt: number;
  messages: UiChatMsg[];
};

export async function createUiChatSession(createdBy: string, title: string): Promise<string> {
  await ensureMysqlSchema();
  const id = randomUUID();
  const session: UiChatSession = {
    id,
    title,
    createdBy,
    createdAt: Date.now(),
    messages: [],
  };
  await getMysqlPool().execute(
    `INSERT INTO source_builder_ui_chats (id, data) VALUES (?, CAST(? AS JSON))`,
    [id, json(session)]
  );
  return id;
}

export async function getUiChatSession(id: string): Promise<UiChatSession | null> {
  await ensureMysqlSchema();
  const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(
    "SELECT data FROM source_builder_ui_chats WHERE id = ? LIMIT 1",
    [id]
  );
  if (!rows[0]) return null;
  return parseJson<UiChatSession>(rows[0].data, null as unknown as UiChatSession);
}

export async function saveUiChatSession(session: UiChatSession): Promise<void> {
  await ensureMysqlSchema();
  await getMysqlPool().execute(
    `INSERT INTO source_builder_ui_chats (id, data)
     VALUES (?, CAST(? AS JSON))
     ON DUPLICATE KEY UPDATE data = VALUES(data)`,
    [session.id, json(session)]
  );
}

export async function appendUiChatMessage(sessionId: string, msg: UiChatMsg): Promise<void> {
  const session = await getUiChatSession(sessionId);
  if (!session) return;
  await saveUiChatSession({
    ...session,
    messages: [...session.messages, msg],
  });
}

export async function listUiChatSessions(userEmail: string, count = 20): Promise<UiChatSession[]> {
  await ensureMysqlSchema();
  const limit = Math.max(1, Math.min(count, 100));
  const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(
    `SELECT data FROM source_builder_ui_chats
     WHERE created_by = ?
     ORDER BY created_at DESC
     LIMIT ${limit}`,
    [userEmail]
  );
  return rows.map((row) => parseJson<UiChatSession>(row.data, null as unknown as UiChatSession));
}

export async function updateUiChatTitle(sessionId: string, title: string): Promise<void> {
  const session = await getUiChatSession(sessionId);
  if (!session) return;
  await saveUiChatSession({ ...session, title });
}
