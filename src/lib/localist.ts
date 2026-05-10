const LOCALIST_BASE_URL = "https://calendar.oberlin.edu/api/2/events";

const ATHLETIC_KEYWORDS = [
  "athletic",
  "athletics",
  "varsity",
  "varsity sports",
  "sports and fitness",
];

export type LocalistEventInstance = {
  event_instance: {
    start: string;
    end: string | null;
    all_day: boolean;
  };
};

export type LocalistEventFilter = {
  name: string;
  id?: number;
};

export type LocalistEvent = {
  id: string;
  title: string;
  url: string;
  urlname: string;
  description: string;
  description_text: string;
  location_name: string;
  address: string;
  ticket_url: string;
  photo_url: string | null;
  filters: {
    event_public_events?: LocalistEventFilter[];
    event_types?: LocalistEventFilter[];
    departments?: LocalistEventFilter[];
  };
  event_instances: LocalistEventInstance[];
};

function isOpenToPublic(event: LocalistEvent): boolean {
  const audiences = event.filters?.event_public_events ?? [];
  // Accept if no audience restriction OR if any audience label includes "open to all"
  if (audiences.length === 0) return true;
  return audiences.some((a) =>
    a.name.toLowerCase().includes("open to all")
  );
}

function isAthletic(event: LocalistEvent): boolean {
  const types = (event.filters?.event_types ?? []).map((t) =>
    t.name.toLowerCase()
  );
  const titleLower = event.title.toLowerCase();
  return ATHLETIC_KEYWORDS.some(
    (kw) => types.some((t) => t.includes(kw)) || titleLower.includes(kw)
  );
}

export async function fetchLocalistEvents(
  days = 90,
  perPage = 100,
  maxPages = 5
): Promise<LocalistEvent[]> {
  const results: LocalistEvent[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(LOCALIST_BASE_URL);
    url.searchParams.set("days", String(days));
    url.searchParams.set("pp", String(perPage));
    url.searchParams.set("page", String(page));

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (!res.ok) break;

    const data = await res.json();
    const events: LocalistEvent[] = (data.events ?? []).map(
      (e: { event: LocalistEvent }) => e.event
    );

    const filtered = events.filter(
      (ev) => isOpenToPublic(ev) && !isAthletic(ev)
    );
    results.push(...filtered);

    if (events.length < perPage) break;
  }

  return results;
}

export function isLocalistEventAthletic(event: LocalistEvent): boolean {
  return isAthletic(event);
}
