import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_AGENT_ID = "agent_01GsW3vssQVsjyUxyrfjqCAW";
const DEFAULT_ENVIRONMENT_ID = "env_018SM1BPg2F17sLSppzqB3qA";

export type ManagedAgentRunResult = {
  sessionId: string;
  text: string;
};

export type ManagedAgentRunOptions = {
  title?: string;
  onText?: (text: string) => void;
};

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

function getManagedAgentConfig() {
  return {
    agent: process.env.ANTHROPIC_MANAGED_AGENT_ID ?? DEFAULT_AGENT_ID,
    environmentId: process.env.ANTHROPIC_MANAGED_AGENT_ENVIRONMENT_ID ?? DEFAULT_ENVIRONMENT_ID,
  };
}

function getErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return String(error);
  if ("message" in error && typeof error.message === "string") return error.message;
  return JSON.stringify(error);
}

export async function runManagedAgentText(
  prompt: string,
  options: ManagedAgentRunOptions | ((text: string) => void) = {}
): Promise<ManagedAgentRunResult> {
  const client = getAnthropicClient();
  const { agent, environmentId } = getManagedAgentConfig();
  const runOptions = typeof options === "function" ? { onText: options } : options;

  const session = await client.beta.sessions.create({
    agent,
    environment_id: environmentId,
    title: runOptions.title ?? "Civic Calendar managed agent run",
  });

  const stream = await client.beta.sessions.events.stream(session.id);

  await client.beta.sessions.events.send(session.id, {
    events: [
      {
        type: "user.message",
        content: [{ type: "text", text: prompt }],
      },
    ],
  });

  let text = "";
  let sawRunForPrompt = false;

  for await (const event of stream) {
    if (event.type === "session.status_running") {
      sawRunForPrompt = true;
      continue;
    }

    if (event.type === "agent.message") {
      sawRunForPrompt = true;
      const chunk = event.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");

      if (chunk) {
        text += chunk;
        runOptions.onText?.(chunk);
      }
      continue;
    }

    if (event.type === "session.status_idle") {
      if (!sawRunForPrompt && !text) continue;

      if (event.stop_reason.type === "requires_action") {
        throw new Error(`Managed agent requires action for event(s): ${event.stop_reason.event_ids.join(", ")}`);
      }

      if (event.stop_reason.type === "retries_exhausted") {
        throw new Error("Managed agent stopped after exhausting retries");
      }

      break;
    }

    if (event.type === "session.error") {
      throw new Error(`Managed agent error: ${getErrorMessage(event.error)}`);
    }

    if (event.type === "session.status_terminated") {
      throw new Error("Managed agent session terminated before finishing");
    }
  }

  return { sessionId: session.id, text };
}
