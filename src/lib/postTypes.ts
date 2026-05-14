export type EventType = "ot" | "an";
export type DisplayType = "all" | "ps" | "sps" | "ss";
export type LocationType = "ph2" | "on" | "bo" | "ne";
export type ReviewStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "needs_correction"
  | "archived"
  | "published"
  | "duplicate";

/** Official Oberlin Community Hub `postTypeId` values (closed set for classifiers). */
export const COMMUNITY_HUB_POST_TYPE_IDS_FOR_CLASSIFIER = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 59, 89,
] as const;

export const COMMUNITY_HUB_POST_TYPES: Record<number, string> = {
  1: "Volunteer Opportunity",
  2: "Exhibit",
  3: "Fair, Festival, or Public Celebration",
  4: "Tour, Walking Tours or Open House",
  5: "Film",
  6: "Presentation or Lecture",
  7: "Workshop or Class",
  8: "Music Performance",
  9: "Theatre or Dance",
  10: "City Government",
  11: "Spectator Sport",
  12: "Participatory Sport or Game",
  13: "Networking Event",
  59: "Ecolympics or Environmental",
  89: "Other",
};

export function getCommunityHubPostTypeLabel(ids: number[]): string {
  if (!ids || ids.length === 0) return "Other";
  return ids.map((id) => COMMUNITY_HUB_POST_TYPES[id] ?? "Other").join(", ");
}

export type Session = {
  startTime: number | null;
  endTime: number | null;
};

export type ExtractedMetadata = {
  extractedAt: string;
  model: string;
  sourceRecordId?: string;
  notes?: string;
};

export type BasePost = {
  id: string;
  eventType: EventType;
  email: string;
  title: string;
  description: string;
  extendedDescription?: string;
  sponsors: string[];
  postTypeId: number[];
  sessions: Session[];
  display: DisplayType;
  screensIds: string[];
  status: ReviewStatus;
  sourceName: string;
  sourceUrl: string;
  calendarSourceName?: string;
  calendarSourceUrl?: string;
  originalDescription?: string;
  imageUrl?: string;
  image_cdn_url?: string;
  aiConfidence: number | null;
  extractedMetadata: ExtractedMetadata;
  duplicateGroupId?: string;
  duplicateWarning?: string;
  rejectionReason?: string;
  communityHubPostId?: string;
  createdAt?: number;
};

export type EventPost = BasePost & {
  eventType: "ot";
  locationType: LocationType;
  location?: string;
  urlLink?: string;
  placeId?: string;
  placeName?: string;
  roomNum?: string;
  website?: string;
  contactEmail?: string;
  phone?: string;
};

export type AnnouncementPost = BasePost & {
  eventType: "an";
  locationType: "ne";
  website?: string;
  contactEmail?: string;
  phone?: string;
};

export type ReviewPost = EventPost | AnnouncementPost;

export type DuplicateGroup = {
  id: string;
  postIds: string[];
  similarityScore: number;
  matchingSignals: string[];
  conflictFields: string[];
  recommendation: string;
  status: "open" | "resolved";
};

export function getPostTypeLabel(eventType: EventType) {
  if (eventType === "ot") return "Event";
  return "Announcement";
}
