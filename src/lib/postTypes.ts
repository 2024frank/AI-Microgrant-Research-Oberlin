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

export const COMMUNITY_HUB_POST_TYPES: Record<number, string> = {
  0: "City Government",
  1: "Ecolympics or Environmental",
  2: "Exhibit",
  3: "Fair, Festival, or Public Celebration",
  4: "Film",
  5: "Music Performance",
  6: "Networking Event",
  7: "Participatory Sport or Game",
  8: "Presentation or Lecture",
  9: "Spectator Sport",
  10: "Theatre or Dance",
  11: "Tour, Walking Tours or Open House",
  12: "Volunteer Opportunity",
  13: "Workshop or Class",
  14: "Other",
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
