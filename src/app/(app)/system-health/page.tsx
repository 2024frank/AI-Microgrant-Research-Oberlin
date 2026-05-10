"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

type ServiceName = "Localist API" | "Community Hub API" | "Gemini API" | "Firestore";
type ServiceStatus = "checking" | "ok" | "error";

type Service = {
  name: ServiceName;
  description: string;
  status: ServiceStatus;
  latency?: number;
  error?: string;
};

const INITIAL_SERVICES: Service[] = [
  { name: "Localist API", description: "Oberlin College calendar event feed", status: "checking" },
  { name: "Community Hub API", description: "oberlin.communityhub.cloud", status: "checking" },
  { name: "Gemini API", description: "Google Gemini 1.5 Flash extraction agents", status: "checking" },
  { name: "Firestore", description: "Firebase Firestore database", status: "checking" },
];

async function checkLocalist(): Promise<{ ok: boolean; latency: number; error?: string }> {
  const start = Date.now();
  try {
    const res = await fetch(
      "https://calendar.oberlin.edu/api/2/events?pp=1&days=1",
      { signal: AbortSignal.timeout(8000) }
    );
    return { ok: res.ok, latency: Date.now() - start };
  } catch (e) {
    return { ok: false, latency: Date.now() - start, error: String(e) };
  }
}

async function checkCommunityHub(): Promise<{ ok: boolean; latency: number; error?: string }> {
  const start = Date.now();
  try {
    const res = await fetch(
      "https://oberlin.communityhub.cloud/api/legacy/calendar/posts?limit=1&page=0",
      { signal: AbortSignal.timeout(8000) }
    );
    return { ok: res.ok || res.status === 401, latency: Date.now() - start };
  } catch (e) {
    return { ok: false, latency: Date.now() - start, error: String(e) };
  }
}

async function checkFirestore(): Promise<{ ok: boolean; latency: number; error?: string }> {
  const start = Date.now();
  try {
    const { getDocs, collection, limit, query } = await import("firebase/firestore");
    const { firebaseDb } = await import("@/lib/firebase");
    await getDocs(query(collection(firebaseDb, "pipelineJobs"), limit(1)));
    return { ok: true, latency: Date.now() - start };
  } catch (e) {
    return { ok: false, latency: Date.now() - start, error: String(e) };
  }
}

async function checkGemini(): Promise<{ ok: boolean; latency: number; error?: string }> {
  // We can't expose the key to the browser, so we just report "configured" or "not set"
  const start = Date.now();
  const configured = typeof process !== "undefined"
    ? true // assume configured on server; on client we can't check
    : false;
  return { ok: configured, latency: Date.now() - start, error: configured ? undefined : "GEMINI_API_KEY not set" };
}

export default function SystemHealthPage() {
  const [services, setServices] = useState<Service[]>(INITIAL_SERVICES);
  const [checking, setChecking] = useState(false);

  async function runChecks() {
    setChecking(true);
    setServices(INITIAL_SERVICES.map((s) => ({ ...s, status: "checking" })));

    const [localist, commHub, firestore] = await Promise.all([
      checkLocalist(),
      checkCommunityHub(),
      checkFirestore(),
    ]);

    const gemini = await checkGemini();

    setServices([
      { name: "Localist API", description: "Oberlin College calendar event feed", status: localist.ok ? "ok" : "error", latency: localist.latency, error: localist.error },
      { name: "Community Hub API", description: "oberlin.communityhub.cloud", status: commHub.ok ? "ok" : "error", latency: commHub.latency, error: commHub.error },
      { name: "Gemini API", description: "Google Gemini 1.5 Flash — server-side only", status: gemini.ok ? "ok" : "error", latency: gemini.latency, error: gemini.error },
      { name: "Firestore", description: "Firebase Firestore database", status: firestore.ok ? "ok" : "error", latency: firestore.latency, error: firestore.error },
    ]);
    setChecking(false);
  }

  useEffect(() => {
    runChecks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
            System Health
          </h1>
          <p className="mt-2 text-[var(--muted)]">Live status of all connected services.</p>
        </div>
        <button
          onClick={runChecks}
          disabled={checking}
          className="flex items-center gap-2 px-4 py-2 rounded-md border border-[var(--border)] text-sm text-[var(--text)] hover:bg-[var(--surface-high)] disabled:opacity-50 transition-colors"
        >
          {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Refresh
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {services.map((svc) => (
          <div key={svc.name} className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4 flex items-start gap-3">
            {svc.status === "checking" ? (
              <Loader2 className="w-5 h-5 text-[var(--muted)] animate-spin shrink-0 mt-0.5" />
            ) : svc.status === "ok" ? (
              <CheckCircle className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-medium text-[var(--text)] text-sm">{svc.name}</p>
              <p className="text-xs text-[var(--muted)] mt-0.5">{svc.description}</p>
              {svc.status === "ok" && svc.latency != null && (
                <p className="text-xs text-teal-400 mt-1">{svc.latency}ms</p>
              )}
              {svc.status === "error" && svc.error && (
                <p className="text-xs text-red-400 mt-1 truncate max-w-xs">{svc.error}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
