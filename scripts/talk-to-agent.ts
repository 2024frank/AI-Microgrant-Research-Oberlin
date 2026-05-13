#!/usr/bin/env npx tsx
/**
 * talk-to-agent.ts
 *
 * Minimal client for Anthropic Managed Agents.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/talk-to-agent.ts [message]
 *
 * The script:
 *   1. Creates a session attached to the pre-configured agent + environment.
 *   2. Opens a server-sent-event stream so no events are lost.
 *   3. Sends a user.message to kick off the agent.
 *   4. Prints agent.message text blocks to stdout as they arrive.
 *   5. Exits cleanly on session.status_idle (end_turn).
 *   6. Exits with code 1 on any error event or fatal exception.
 */

import Anthropic from "@anthropic-ai/sdk";

// ── Configuration ─────────────────────────────────────────────────────────────

const AGENT_ID = "agent_01GsW3vssQVsjyUxyrfjqCAW";
const ENVIRONMENT_ID = "env_018SM1BPg2F17sLSppzqB3qA";

/** Accept an optional message from the CLI; fall back to a sensible default. */
const USER_MESSAGE =
  process.argv[2] ?? "Hello! Please introduce yourself briefly.";

// ── Helpers ───────────────────────────────────────────────────────────────────

function info(...args: unknown[]) {
  process.stderr.write(`[info]  ${args.join(" ")}\n`);
}

function warn(...args: unknown[]) {
  process.stderr.write(`[warn]  ${args.join(" ")}\n`);
}

function fatal(...args: unknown[]) {
  process.stderr.write(`[error] ${args.join(" ")}\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Validate API key early so the error message is obvious.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    fatal("ANTHROPIC_API_KEY environment variable is not set.");
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });

  // ── Step 1: Create a session ──────────────────────────────────────────────
  info(`Creating session  agent=${AGENT_ID}  env=${ENVIRONMENT_ID}`);
  const session = await client.beta.sessions.create({
    agent: AGENT_ID,
    environment_id: ENVIRONMENT_ID,
  });
  info(`Session created → ${session.id}`);

  // ── Step 2: Open the event stream ─────────────────────────────────────────
  // Open the stream *before* sending the message so that no events are lost
  // to a race condition between send() and the first read.
  info("Opening event stream…");
  const stream = await client.beta.sessions.events.stream(session.id);

  // ── Step 3: Send the user message ─────────────────────────────────────────
  info(`Sending → "${USER_MESSAGE}"`);
  await client.beta.sessions.events.send(session.id, {
    events: [
      {
        type: "user.message",
        content: [{ type: "text", text: USER_MESSAGE }],
      },
    ],
  });

  // ── Step 4: Process the event stream ─────────────────────────────────────
  process.stderr.write("\n── Agent response ────────────────────────────\n");

  try {
    for await (const event of stream) {
      switch (event.type) {
        // ── Agent output ───────────────────────────────────────────────────
        case "agent.message":
          // Each block carries a text chunk; write directly so output is
          // progressive even when multiple blocks arrive in one event.
          for (const block of event.content) {
            process.stdout.write(block.text);
          }
          break;

        // ── Observability / progress signals ──────────────────────────────
        case "agent.thinking":
          process.stderr.write("[thinking…]\n");
          break;

        case "agent.tool_use":
          process.stderr.write(`[tool]     ${event.name}\n`);
          break;

        case "agent.mcp_tool_use":
          process.stderr.write(
            `[mcp-tool] ${event.mcp_server_name}::${event.name}\n`,
          );
          break;

        case "agent.tool_result":
        case "agent.mcp_tool_result":
          // Silently consume – tool results are rarely interesting at the CLI.
          break;

        case "session.status_running":
          process.stderr.write("[running]\n");
          break;

        case "session.status_rescheduled":
          warn("Session rescheduled (transient error, retrying…)");
          break;

        // ── Terminal / idle states ─────────────────────────────────────────
        case "session.status_idle": {
          const { stop_reason } = event;

          if (stop_reason.type === "end_turn") {
            // Normal finish – add a trailing newline then exit cleanly.
            process.stdout.write("\n");
            process.stderr.write(
              "\n── Done (end_turn) ───────────────────────────\n",
            );
            return;
          }

          if (stop_reason.type === "requires_action") {
            warn(
              "Session requires action but this client does not handle it.\n" +
                `Blocked event IDs: ${stop_reason.event_ids.join(", ")}`,
            );
            return;
          }

          // retries_exhausted or unknown future variant
          warn(`Session idle with stop_reason="${stop_reason.type}". Exiting.`);
          return;
        }

        case "session.status_terminated":
          process.stdout.write("\n");
          fatal("Session terminated unexpectedly.");
          process.exit(1);
          break;

        case "session.deleted":
          process.stdout.write("\n");
          fatal("Session was deleted while streaming.");
          process.exit(1);
          break;

        // ── Error events ──────────────────────────────────────────────────
        case "session.error": {
          const { error } = event;
          const retryable = error.retry_status.type === "retrying";

          if (retryable) {
            warn(`Session error (retrying): [${error.type}] ${error.message}`);
            // Stay in the loop – the harness will retry automatically.
          } else {
            process.stdout.write("\n");
            fatal(`Session error [${error.type}]: ${error.message}`);
            process.exit(1);
          }
          break;
        }

        default:
          // Silently ignore span.*, session.thread.*, and any future events.
          break;
      }
    }
  } catch (err: unknown) {
    process.stdout.write("\n");
    fatal(
      "Stream error:",
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }
}

// ── Entry-point ───────────────────────────────────────────────────────────────

main().catch((err: unknown) => {
  fatal(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
