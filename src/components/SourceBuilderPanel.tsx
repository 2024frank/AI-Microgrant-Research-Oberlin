"use client";

import { useCallback, useEffect, useId, useState } from "react";
import {
  Sparkles,
  Wand2,
  TerminalSquare,
  History,
  Loader2,
  Inbox,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SourceBuilderRecord = {
  id: string;
  status: "draft" | "running" | "completed" | "failed";
  prompt: string;
  sessionId?: string;
  agentName?: string;
  agentVersion?: number;
  summary?: string;
  messages: string[];
  toolEvents: string[];
  warning?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

const DEFAULT_PROMPT =
  "Review the current source builder setup for Oberlin Civic Calendar. Recommend the next source integration plan, the data fields to capture, and any reliability checks needed before launch.";

function formatRunTime(ts?: number) {
  if (!ts) return "Unknown time";
  return new Date(ts).toLocaleString();
}

function statusLabel(status: SourceBuilderRecord["status"]) {
  switch (status) {
    case "draft":
      return "Draft";
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function statusBadgeClass(status: SourceBuilderRecord["status"]) {
  switch (status) {
    case "completed":
      return "border-teal-300/70 bg-teal-300/10 text-teal-100";
    case "failed":
      return "border-red-300/70 bg-red-300/10 text-red-100";
    case "running":
      return "border-amber-300/70 bg-amber-300/10 text-amber-100";
    default:
      return "border-slate-400/50 bg-slate-400/10 text-slate-200";
  }
}

export function SourceBuilderPanel() {
  const promptId = useId();
  const promptHintId = `${promptId}-hint`;
  const [builderPrompt, setBuilderPrompt] = useState(DEFAULT_PROMPT);
  const [builderRuns, setBuilderRuns] = useState<SourceBuilderRecord[]>([]);
  const [listStatus, setListStatus] = useState<"loading" | "ready" | "error">("loading");
  const [listError, setListError] = useState<string | null>(null);
  const [builderRunning, setBuilderRunning] = useState(false);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [acknowledgeEmptyPrompt, setAcknowledgeEmptyPrompt] = useState(false);
  const emptyBypassId = useId();
  const emptyBypassDescId = `${emptyBypassId}-desc`;

  const refreshRuns = useCallback(async () => {
    setListStatus("loading");
    setListError(null);
    try {
      const { getClientBearerAuthHeader } = await import("@/lib/clientAuthHeaders");
      const res = await fetch("/api/source-builder", {
        cache: "no-store",
        headers: await getClientBearerAuthHeader(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.error === "string" ? err.error : "Could not load builder history.");
      }
      const data = (await res.json()) as { sessions?: SourceBuilderRecord[] };
      setBuilderRuns(data.sessions ?? []);
      setListStatus("ready");
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Could not load builder history.");
      setListStatus("error");
    }
  }, []);

  useEffect(() => {
    void refreshRuns();
  }, [refreshRuns]);

  async function handleRunSourceBuilder() {
    setBuilderRunning(true);
    setBuilderError(null);
    try {
      const trimmed = builderPrompt.trim();
      const { getClientJsonAuthHeaders } = await import("@/lib/clientAuthHeaders");
      const res = await fetch("/api/source-builder", {
        method: "POST",
        headers: await getClientJsonAuthHeaders(),
        body: JSON.stringify({
          prompt: trimmed,
          ...(trimmed.length === 0 && acknowledgeEmptyPrompt ? { acknowledgeEmptyPrompt: true } : {}),
        }),
      });
      const data = (await res.json()) as { error?: string; session?: SourceBuilderRecord };
      if (!res.ok) {
        throw new Error(data.error ?? data.session?.error ?? "Source Builder failed");
      }
      if (data.session) {
        setBuilderRuns((runs) => [data.session!, ...runs.filter((run) => run.id !== data.session!.id)]);
      }
      setListStatus("ready");
    } catch (err) {
      setBuilderError(err instanceof Error ? err.message : "Source Builder failed");
    } finally {
      setBuilderRunning(false);
    }
  }

  const trimmedPrompt = builderPrompt.trim();
  const canRun =
    !builderRunning && (trimmedPrompt.length > 0 || acknowledgeEmptyPrompt);
  const latest = builderRuns[0];

  return (
    <section
      className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)]"
      aria-labelledby="source-builder-heading"
    >
      <div className="border-b border-[var(--border)] p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 max-w-3xl space-y-4">
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--primary-soft)] text-[var(--primary)]">
                <Sparkles className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2
                  id="source-builder-heading"
                  className="font-[var(--font-public-sans)] text-lg font-semibold tracking-[-0.01em] text-[var(--text)]"
                >
                  Source Builder
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                  Claude Managed Agent workspace for designing and improving source integrations.
                </p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                <p className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
                  Agent
                </p>
                <p className="mt-1 text-sm text-[var(--text)]">
                  {latest?.agentName
                    ? `${latest.agentName} v${latest.agentVersion ?? "?"}`.trim()
                    : "Civic Calendar"}
                </p>
              </div>
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                <p className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
                  Database
                </p>
                <p className="mt-1 text-sm text-teal-400">DigitalOcean MySQL</p>
              </div>
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                <p className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
                  Scope
                </p>
                <p className="mt-1 text-sm text-[var(--text)]">Source Builder only</p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
            <button
              type="button"
              onClick={() => void refreshRuns()}
              disabled={listStatus === "loading" || builderRunning}
              className={cn(
                "inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[var(--border)] px-4 text-sm font-medium text-[var(--text)] transition-colors",
                "hover:bg-[var(--surface-high)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)]",
                "disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto lg:w-full",
              )}
            >
              {listStatus === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden />
              )}
              Refresh history
            </button>
            <button
              type="button"
              onClick={() => void handleRunSourceBuilder()}
              disabled={!canRun}
              aria-disabled={!canRun}
              aria-label={
                trimmedPrompt.length === 0 && acknowledgeEmptyPrompt
                  ? "Run Source Builder using placeholder brief"
                  : "Run Source Builder"
              }
              className={cn(
                "inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-4 text-sm font-semibold text-white transition-opacity",
                "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)]",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {builderRunning ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wand2 className="h-4 w-4" aria-hidden />}
              {builderRunning ? "Agent working…" : "Run Source Builder"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_min(100%,380px)]">
        <div className="border-b border-[var(--border)] p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <label
            className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]"
            htmlFor={promptId}
          >
            Builder brief
          </label>
          <p id={promptHintId} className="mt-1 text-xs text-[var(--muted)]">
            Describe the source, connector, or audit you want. The agent returns an implementation-ready summary.
          </p>
          <textarea
            id={promptId}
            aria-describedby={`${promptHintId}${trimmedPrompt.length === 0 ? ` ${emptyBypassDescId}` : ""}`}
            value={builderPrompt}
            onChange={(event) => {
              setBuilderPrompt(event.target.value);
              if (event.target.value.trim().length > 0) {
                setAcknowledgeEmptyPrompt(false);
              }
            }}
            rows={6}
            className={cn(
              "mt-3 min-h-[10rem] w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm leading-6 text-[var(--text)] outline-none transition-colors placeholder:text-[var(--muted)]",
              "focus:border-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)]",
            )}
            placeholder="Ask the Source Builder agent to design a source, audit a connector, or produce an integration plan."
          />

          {trimmedPrompt.length === 0 && (
            <div className="mt-3 rounded-md border border-amber-800/40 bg-amber-950/25 p-3">
              <div className="flex gap-3">
                <input
                  id={emptyBypassId}
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 rounded border border-[var(--border)] accent-[var(--primary)]"
                  checked={acknowledgeEmptyPrompt}
                  onChange={(e) => setAcknowledgeEmptyPrompt(e.target.checked)}
                  aria-describedby={emptyBypassDescId}
                />
                <label htmlFor={emptyBypassId} className="text-sm leading-snug text-[var(--text)] cursor-pointer">
                  <span className="font-medium text-amber-200/95">Run without a custom brief</span>
                  <span id={emptyBypassDescId} className="mt-1 block text-xs text-[var(--muted)]">
                    Sends an explicit placeholder brief to the agent so the run is not a silent empty request. Use only when you intentionally want a default audit-style run.
                  </span>
                </label>
              </div>
            </div>
          )}

          {builderRunning && (
            <div
              className="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface)] p-4"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium text-[var(--text)]">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--primary)]" aria-hidden />
                  Working in the Source Builder environment
                </span>
                <span className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
                  Managed Agent
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-high)]" aria-hidden>
                <div className="h-full w-2/5 max-w-[66%] rounded-full bg-[var(--primary)] opacity-90" />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
                The agent can inspect its connected workspace and reason through your brief. This can take a minute.
              </p>
            </div>
          )}

          {builderError && (
            <div
              className="mt-4 rounded-md border border-red-800/50 bg-red-900/20 p-3 text-sm text-red-300"
              role="alert"
            >
              {builderError}
            </div>
          )}
        </div>

        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <History className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden />
            <h3 className="text-sm font-semibold text-[var(--text)]">Recent builder runs</h3>
          </div>

          {listStatus === "loading" && (
            <ul className="space-y-3" aria-busy="true" aria-label="Loading builder history">
              {[0, 1, 2].map((i) => (
                <li
                  key={i}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 motion-reduce:animate-none"
                >
                  <div className="flex justify-between gap-3">
                    <span className="h-4 w-16 rounded bg-[var(--surface-high)] motion-safe:animate-pulse motion-reduce:animate-none" />
                    <span className="h-4 w-28 rounded bg-[var(--surface-high)] motion-safe:animate-pulse motion-reduce:animate-none" />
                  </div>
                  <div className="mt-3 h-3 w-full rounded bg-[var(--surface-high)] motion-safe:animate-pulse motion-reduce:animate-none" />
                  <div className="mt-2 h-3 w-[85%] rounded bg-[var(--surface-high)] motion-safe:animate-pulse motion-reduce:animate-none" />
                </li>
              ))}
            </ul>
          )}

          {listStatus === "error" && (
            <div
              className="rounded-md border border-red-800/40 bg-red-900/15 p-4"
              role="alert"
            >
              <p className="text-sm text-red-200">{listError ?? "Something went wrong."}</p>
              <button
                type="button"
                onClick={() => void refreshRuns()}
                className="mt-3 text-sm font-medium text-[var(--primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] rounded-sm"
              >
                Try again
              </button>
            </div>
          )}

          {listStatus === "ready" && builderRuns.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-10 text-center">
              <Inbox className="h-8 w-8 text-[var(--muted)]" strokeWidth={1.5} aria-hidden />
              <div>
                <p className="text-sm font-medium text-[var(--text)]">No runs yet</p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-[var(--muted)]">
                  Add a brief on the left and run the builder. Past summaries and tool activity will show up here.
                </p>
              </div>
            </div>
          )}

          {listStatus === "ready" && builderRuns.length > 0 && (
            <ul className="space-y-3">
              {builderRuns.slice(0, 6).map((run) => (
                <li key={run.id}>
                  <article className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded border px-2 py-0.5 font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em]",
                          statusBadgeClass(run.status),
                        )}
                      >
                        {statusLabel(run.status)}
                      </span>
                      <time
                        className="text-[11px] text-[var(--muted)] tabular-nums"
                        dateTime={run.createdAt ? new Date(run.createdAt).toISOString() : undefined}
                      >
                        {formatRunTime(run.createdAt)}
                      </time>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-snug text-[var(--text)]">{run.prompt}</p>
                    {run.summary && (
                      <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-[var(--muted)]">
                        {run.summary}
                      </p>
                    )}
                    {run.toolEvents.length > 0 && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-[var(--muted)]">
                        <TerminalSquare className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                        <span className="min-w-0 break-words">{run.toolEvents.slice(-1)[0]}</span>
                      </p>
                    )}
                    {run.warning && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-200/90">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
                        <span>{run.warning}</span>
                      </p>
                    )}
                    {run.error && (
                      <p className="mt-2 text-xs text-red-300" role="status">
                        {run.error}
                      </p>
                    )}
                  </article>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
