import type { SourceSchedule } from "./sources";

export type SourceConfig = {
  id: string;
  name: string;
  description: string;
  type: "rest_api" | "ical" | "rss" | "custom_code";
  enabled: boolean;

  // Used for rest_api, ical, rss
  url?: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  params?: Record<string, string>;

  pagination?: {
    type: "page" | "offset" | "none";
    paramName: string;
    startValue: number;
    increment: number;
    maxPages: number;
  };

  responsePath?: string;

  fieldMappings?: {
    id: string;
    title: string;
    description: string;
    startTime: string;
    endTime?: string;
    location?: string;
    url?: string;
    image?: string;
    category?: string;
  };

  filters?: {
    excludePatterns?: string[];
    includeOnly?: string[];
  };

  // Used for custom_code — an async function body that returns NormalizedEvent[]
  sourceCode?: string;

  schedule: SourceSchedule;
  scheduleHour: number;

  createdAt: number;
  createdBy: string;
  lastRun?: number;
  lastEventCount?: number;
};

export type NormalizedEvent = {
  id: string;
  title: string;
  description: string;
  startTime: number | null;
  endTime: number | null;
  location: string | null;
  url: string | null;
  image: string | null;
  category: string | null;
  sourceName: string;
  sourceUrl: string;
};

function getNestedValue(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function parseTimestamp(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === "number") {
    return val > 1e12 ? Math.floor(val / 1000) : val;
  }
  if (typeof val === "string") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return Math.floor(d.getTime() / 1000);
  }
  return null;
}

// Execute a custom_code source — runs the AI-written async function body server-side
export async function runCustomCode(
  sourceCode: string,
  maxEvents = 200
): Promise<{ events: NormalizedEvent[]; raw: unknown[]; error?: string }> {
  try {
    // The code is an async function body that should return NormalizedEvent[]
    // We provide fetch, URL, URLSearchParams, JSON, Date as safe globals
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => () => Promise<unknown>;
    const fn = new AsyncFunction("fetch", "URL", "URLSearchParams", "JSON", "Date", "maxEvents", sourceCode) as (
      fetch: typeof globalThis.fetch,
      URL: typeof globalThis.URL,
      URLSearchParams: typeof globalThis.URLSearchParams,
      JSON: typeof globalThis.JSON,
      Date: typeof globalThis.Date,
      maxEvents: number
    ) => Promise<NormalizedEvent[]>;

    const events = await fn(fetch, URL, URLSearchParams, JSON, Date, maxEvents);
    if (!Array.isArray(events)) {
      return { events: [], raw: [], error: "Custom code must return an array of events" };
    }
    return { events: events.slice(0, maxEvents), raw: events.slice(0, maxEvents) };
  } catch (err) {
    return { events: [], raw: [], error: err instanceof Error ? err.message : "Custom code execution failed" };
  }
}

export async function fetchWithConfig(
  config: SourceConfig,
  maxEvents = 20
): Promise<{ events: NormalizedEvent[]; raw: unknown[]; error?: string }> {
  // Custom code sources are executed directly
  if (config.type === "custom_code") {
    if (!config.sourceCode) return { events: [], raw: [], error: "No source code provided" };
    return runCustomCode(config.sourceCode, maxEvents);
  }

  try {
    if (!config.url) return { events: [], raw: [], error: "No URL configured" };
    const allRaw: unknown[] = [];
    const pages = config.pagination?.maxPages ?? 1;

    for (let page = 0; page < pages; page++) {
      const url = new URL(config.url);

      if (config.params) {
        for (const [k, v] of Object.entries(config.params)) {
          url.searchParams.set(k, v);
        }
      }

      if (config.pagination && config.pagination.type !== "none") {
        const val = config.pagination.startValue + page * config.pagination.increment;
        url.searchParams.set(config.pagination.paramName, String(val));
      }

      const res = await fetch(url.toString(), {
        method: config.method,
        headers: {
          Accept: "application/json",
          ...config.headers,
        },
      });

      if (!res.ok) {
        return { events: [], raw: [], error: `HTTP ${res.status}: ${res.statusText}` };
      }

      const data = await res.json();
      const items = config.responsePath ? getNestedValue(data, config.responsePath) : data;

      if (!Array.isArray(items)) {
        return { events: [], raw: [data], error: `Response path "${config.responsePath ?? "root"}" did not return an array. Got: ${typeof items}` };
      }

      allRaw.push(...items);
      if (allRaw.length >= maxEvents) break;
    }

    const limited = allRaw.slice(0, maxEvents);
    const fm = config.fieldMappings;
    if (!fm) return { events: [], raw: limited, error: "No field mappings configured" };

    const events: NormalizedEvent[] = limited.map((item) => {
      const title = String(getNestedValue(item, fm.title) ?? "Untitled");

      if (config.filters?.excludePatterns?.length) {
        const lower = title.toLowerCase();
        if (config.filters.excludePatterns.some((p) => lower.includes(p.toLowerCase()))) {
          return null;
        }
      }

      return {
        id: String(getNestedValue(item, fm.id) ?? Math.random().toString(36).slice(2)),
        title,
        description: String(getNestedValue(item, fm.description) ?? ""),
        startTime: parseTimestamp(getNestedValue(item, fm.startTime)),
        endTime: fm.endTime ? parseTimestamp(getNestedValue(item, fm.endTime)) : null,
        location: fm.location ? String(getNestedValue(item, fm.location) ?? "") || null : null,
        url: fm.url ? String(getNestedValue(item, fm.url) ?? "") || null : null,
        image: fm.image ? String(getNestedValue(item, fm.image) ?? "") || null : null,
        category: fm.category ? String(getNestedValue(item, fm.category) ?? "") || null : null,
        sourceName: config.name,
        sourceUrl: config.url ?? "",
      };
    }).filter(Boolean) as NormalizedEvent[];

    return { events, raw: limited };
  } catch (err) {
    return { events: [], raw: [], error: err instanceof Error ? err.message : "Fetch failed" };
  }
}
