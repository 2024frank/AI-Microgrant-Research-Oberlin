import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import { ensureMysqlSchema, getMysqlPool, json, parseJson } from "./mysql";

export type SourceBuilderStatus = "draft" | "running" | "completed" | "failed";

export type SourceBuilderRecord = {
  id: string;
  status: SourceBuilderStatus;
  prompt: string;
  sessionId?: string;
  vaultIds?: string[];
  title?: string | null;
  agentName?: string;
  agentVersion?: number;
  summary?: string;
  messages: string[];
  toolEvents: string[];
  /** Non-fatal session issues (e.g. `session.error` after useful agent output). */
  warning?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

export function getSourceBuilderAgentConfig() {
  return {
    agentId:
      process.env.SOURCE_BUILDER_AGENT_ID ??
      process.env.CLAUDE_SOURCE_BUILDER_AGENT_ID ??
      process.env.ANTHROPIC_AGENT_ID,
    environmentId:
      process.env.SOURCE_BUILDER_ENVIRONMENT_ID ??
      process.env.CLAUDE_SOURCE_BUILDER_ENVIRONMENT_ID,
    vaultId:
      process.env.SOURCE_BUILDER_VAULT_ID ??
      process.env.CLAUDE_SOURCE_BUILDER_VAULT_ID ??
      process.env.ANTHROPIC_VAULT_ID,
  };
}

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

export async function retrieveSourceBuilderAgent() {
  const { agentId, environmentId, vaultId } = getSourceBuilderAgentConfig();
  if (!agentId) throw new Error("SOURCE_BUILDER_AGENT_ID is not set");

  const client = getClient();
  const agent = await client.beta.agents.retrieve(agentId);
  const vaultIds = await resolveSourceBuilderVaultIds(client);

  return {
    id: agent.id,
    name: agent.name,
    version: agent.version,
    model:
      typeof agent.model === "string"
        ? agent.model
        : "id" in agent.model
          ? agent.model.id
          : "unknown",
    archived: Boolean(agent.archived_at),
    environmentConfigured: Boolean(environmentId),
    vaultConfigured: vaultIds.length > 0,
    vaultIdConfiguredExplicitly: Boolean(vaultId),
  };
}

async function resolveSourceBuilderVaultIds(client: Anthropic) {
  const { vaultId } = getSourceBuilderAgentConfig();
  if (vaultId) return [vaultId];

  const activeVaultIds: string[] = [];
  try {
    for await (const vault of client.beta.vaults.list()) {
      if (!vault.archived_at) activeVaultIds.push(vault.id);
      if (activeVaultIds.length > 1) break;
    }
  } catch {
    return [];
  }

  return activeVaultIds.length === 1 ? activeVaultIds : [];
}

export async function listSourceBuilderSessions(maxResults = 20) {
  await ensureMysqlSchema();
  const limit = Math.max(1, Math.min(Number(maxResults) || 20, 100));
  const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(
    `SELECT data FROM source_builder_sessions ORDER BY created_at DESC LIMIT ${limit}`
  );
  return rows.map((row) =>
    parseJson<SourceBuilderRecord>(row.data, null as unknown as SourceBuilderRecord)
  );
}

export async function getSourceBuilderSession(id: string) {
  await ensureMysqlSchema();
  const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(
    "SELECT data FROM source_builder_sessions WHERE id = ? LIMIT 1",
    [id]
  );
  if (!rows[0]) return null;
  return parseJson<SourceBuilderRecord>(rows[0].data, null as unknown as SourceBuilderRecord);
}

async function saveSourceBuilderSession(record: SourceBuilderRecord) {
  await ensureMysqlSchema();
  await getMysqlPool().execute(
    `INSERT INTO source_builder_sessions (id, data)
     VALUES (?, CAST(? AS JSON))
     ON DUPLICATE KEY UPDATE data = VALUES(data)`,
    [record.id, json(record)]
  );
}

function textFromEvent(event: unknown) {
  const maybe = event as { type?: string; content?: Array<{ type?: string; text?: string }>; name?: string };
  if (maybe.type === "agent.message") {
    return (maybe.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n")
      .trim();
  }
  return "";
}

function toolLabelFromEvent(event: unknown) {
  const maybe = event as { type?: string; name?: string; mcp_server_name?: string };
  if (maybe.type === "agent.tool_use") return maybe.name ? `Used ${maybe.name}` : "Used an agent tool";
  if (maybe.type === "agent.mcp_tool_use") {
    return maybe.name ? `Used ${maybe.mcp_server_name ?? "MCP"} / ${maybe.name}` : "Used an MCP tool";
  }
  if (maybe.type === "agent.thinking") return "Reasoning through the source plan";
  return "";
}

function warningTextFromSessionErrorEvent(event: unknown) {
  const e = event as {
    error?: { message?: string; type?: string };
    message?: string;
  };
  const nested =
    e.error && typeof e.error === "object" && typeof e.error.message === "string"
      ? e.error.message.trim()
      : "";
  if (nested) return nested;
  if (typeof e.message === "string" && e.message.trim()) return e.message.trim();
  return "Managed agent session reported a warning";
}

export async function runSourceBuilderAgent(prompt: string) {
  const config = getSourceBuilderAgentConfig();
  if (!config.agentId) throw new Error("SOURCE_BUILDER_AGENT_ID is not set");
  if (!config.environmentId) throw new Error("SOURCE_BUILDER_ENVIRONMENT_ID is not set");

  const agent = await retrieveSourceBuilderAgent();
  const client = getClient();
  const now = Date.now();
  const localId = randomUUID();

  const record: SourceBuilderRecord = {
    id: localId,
    status: "running",
    prompt,
    agentName: agent.name,
    agentVersion: agent.version,
    messages: [],
    toolEvents: [],
    createdAt: now,
    updatedAt: now,
  };
  await saveSourceBuilderSession(record);

  try {
    const vaultIds = await resolveSourceBuilderVaultIds(client);
    const session = await client.beta.sessions.create({
      agent: config.agentId,
      environment_id: config.environmentId,
      ...(vaultIds.length > 0 ? { vault_ids: vaultIds } : {}),
      metadata: { source: "civic-calendar-source-builder", localId },
    });

    record.sessionId = session.id;
    record.vaultIds = vaultIds;
    record.title = session.title;
    await saveSourceBuilderSession({ ...record, updatedAt: Date.now() });

    await client.beta.sessions.events.send(session.id, {
      events: [
        {
          type: "user.message",
          content: [
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    });

    const seen = new Set<string>();
    for (let attempt = 0; attempt < 45; attempt++) {
      const events = client.beta.sessions.events.list(session.id, { order: "asc" });
      for await (const event of events) {
        const typedEvent = event as { id?: string; type: string };
        const eventId = typedEvent.id ? String(typedEvent.id) : `${typedEvent.type}-${attempt}`;
        if (seen.has(eventId)) continue;
        seen.add(eventId);

        const message = textFromEvent(event);
        if (message) record.messages.push(message);

        const toolLabel = toolLabelFromEvent(event);
        if (toolLabel) record.toolEvents.push(toolLabel);

        if (typedEvent.type === "session.status_terminated") {
          record.status = "completed";
        }
        if (typedEvent.type === "session.error") {
          // Do not mark the run failed here; if the agent already produced output we end as completed + warning.
          record.warning = warningTextFromSessionErrorEvent(event);
        }
      }

      const current = await client.beta.sessions.retrieve(session.id);
      if (current.status === "terminated" || current.status === "idle") {
        const usefulOutput = record.messages.length > 0 || record.status === "completed";
        if (usefulOutput) {
          record.status = "completed";
        } else {
          record.status = "failed";
          if (!record.error) {
            record.error =
              record.warning ?? "Source Builder session ended without agent output";
          }
        }
        break;
      }

      await saveSourceBuilderSession({ ...record, updatedAt: Date.now() });
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    record.summary = record.messages.at(-1) ?? "";
    if (record.messages.length > 0) {
      record.status = "completed";
    } else if (record.status === "running") {
      record.status = "failed";
      if (!record.error) {
        record.error = record.warning ?? "Source Builder finished without agent output";
      }
    }
    record.updatedAt = Date.now();
    await saveSourceBuilderSession(record);
    return record;
  } catch (err) {
    record.status = "failed";
    record.error = err instanceof Error ? err.message : "Source Builder agent failed";
    record.updatedAt = Date.now();
    await saveSourceBuilderSession(record);
    return record;
  }
}
