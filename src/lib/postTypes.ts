export type EventType = "ot" | "an";
export type DisplayType = "all" | "ps" | "sps" | "ss";
export type LocationType = "ph2" | "on" | "bo" | "ne";
export type ReviewStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "needs_correction"
  | "archived";

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
  sponsors: string[];
  postTypeId: number[];
  sessions: Session[];
  display: DisplayType;
  screensIds: string[];
  status: ReviewStatus;
  sourceName: string;
  sourceUrl: string;
  imageUrl?: string;
  aiConfidence: number | null;
  extractedMetadata: ExtractedMetadata;
  duplicateGroupId?: string;
  duplicateWarning?: string;
  rejectionReason?: string;
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
};

export type AnnouncementPost = BasePost & {
  eventType: "an";
  locationType: "ne";
  website?: string;
  contactEmail?: string;
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
  if (eventType === "ot") {
    return "Event";
  }

  return "Announcement";
}
