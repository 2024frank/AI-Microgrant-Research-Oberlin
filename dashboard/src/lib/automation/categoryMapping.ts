export type CategoryKey =
  | "music_performance"
  | "exhibit"
  | "workshop_class"
  | "tour_open_house"
  | "other";

/**
 * CommunityHub category IDs.
 * Keep this as the single source of truth for automations.
 *
 * NOTE:
 * Values below use known defaults from project docs.
 * If CH category IDs change, update this table.
 */
export const CATEGORY_IDS: Record<CategoryKey, number> = {
  music_performance: 9,
  exhibit: 2,
  workshop_class: 7,
  tour_open_house: 4,
  other: 89,
};

/**
 * Lightweight keyword routing for automation agents.
 * Returns one or more CH postTypeId values.
 */
export function inferPostTypeIds(input: {
  title?: string;
  description?: string;
  eventTypes?: string[];
}): number[] {
  const title = (input.title || "").toLowerCase();
  const description = (input.description || "").toLowerCase();
  const eventTypes = (input.eventTypes || []).map(v => v.toLowerCase());
  const text = `${title}\n${description}\n${eventTypes.join(" ")}`;

  if (
    containsAny(text, [
      "concert",
      "orchestra",
      "recital",
      "ensemble",
      "choir",
      "music",
      "performance"
    ])
  ) {
    return [CATEGORY_IDS.music_performance];
  }

  if (containsAny(text, ["exhibit", "exhibition", "gallery", "museum", "installation"])) {
    return [CATEGORY_IDS.exhibit];
  }

  if (containsAny(text, ["workshop", "class", "lesson", "training", "seminar"])) {
    return [CATEGORY_IDS.workshop_class];
  }

  if (containsAny(text, ["tour", "open house", "walkthrough"])) {
    return [CATEGORY_IDS.tour_open_house];
  }

  return [CATEGORY_IDS.other];
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some(keyword => text.includes(keyword));
}
