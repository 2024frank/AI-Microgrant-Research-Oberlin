import type { ReviewPost } from "./postTypes";

const CH_BASE = "https://oberlin.communityhub.cloud/api/legacy/calendar";

export type CHPost = {
  id: string;
  title: string;
  startTime?: number;
  location?: string;
  eventType?: string;
  status?: string;
};

export async function fetchExistingCHPosts(): Promise<CHPost[]> {
  try {
    const url = new URL(`${CH_BASE}/posts`);
    url.searchParams.set("limit", "10000");
    url.searchParams.set("page", "0");
    url.searchParams.set("filter", "future");
    url.searchParams.set("tab", "main-feed");
    url.searchParams.set("isJobs", "false");
    url.searchParams.set("order", "ASC");
    url.searchParams.set("postType", "All");

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (!res.ok) return [];

    const data = await res.json();
    const posts = data.posts ?? data.data ?? data.events ?? data ?? [];
    if (!Array.isArray(posts)) return [];

    return posts.map((p: Record<string, unknown>) => ({
      id: String(p.id ?? ""),
      title: String(p.title ?? ""),
      startTime:
        typeof p.startTime === "number"
          ? p.startTime
          : typeof p.start_time === "number"
          ? p.start_time
          : undefined,
      location: String(p.location ?? p.address ?? ""),
      eventType: String(p.eventType ?? p.event_type ?? ""),
      status: String(p.status ?? ""),
    }));
  } catch {
    return [];
  }
}

export function isDuplicateOfCHPost(
  post: ReviewPost,
  chPosts: CHPost[]
): CHPost | null {
  const startTime =
    post.sessions?.[0]?.startTime != null
      ? Number(post.sessions[0].startTime)
      : null;
  const postLocation =
    "location" in post ? (post.location ?? "").toLowerCase() : "";

  for (const chPost of chPosts) {
    if (!chPost.startTime) continue;

    const timeDiff = Math.abs(chPost.startTime - (startTime ?? 0));
    if (startTime === null || timeDiff > 3600) continue;

    const chLocation = (chPost.location ?? "").toLowerCase();
    const locationMatch =
      postLocation.length > 0 &&
      chLocation.length > 0 &&
      (postLocation.includes(chLocation.slice(0, 10)) ||
        chLocation.includes(postLocation.slice(0, 10)));

    const titleSimilar =
      post.title.toLowerCase().slice(0, 20) ===
      chPost.title.toLowerCase().slice(0, 20);

    if (locationMatch || titleSimilar) return chPost;
  }

  return null;
}

export function buildCommunityHubPayload(
  post: ReviewPost,
  adminEmail: string
): Record<string, unknown> {
  const isEvent = post.eventType === "ot";
  const eventPost = isEvent ? (post as import("./postTypes").EventPost) : null;

  const payload: Record<string, unknown> = {
    eventType: post.eventType,
    email: adminEmail,
    subscribe: true,
    title: post.title,
    description: post.description,
    extendedDescription: post.extendedDescription ?? "",
    sponsors: post.sponsors,
    postTypeId: post.postTypeId,
    sessions: post.sessions.map((s) => ({
      startTime: s.startTime,
      endTime: s.endTime,
    })),
    display: post.display ?? "all",
    screensIds: post.screensIds ?? [],
    public: "1",
    calendarSourceName: post.calendarSourceName ?? "Oberlin College Calendar",
    calendarSourceUrl: post.calendarSourceUrl ?? post.sourceUrl,
  };

  if (post.image_cdn_url) payload.image_cdn_url = post.image_cdn_url;
  else if (post.imageUrl) payload.image_cdn_url = post.imageUrl;

  if (isEvent && eventPost) {
    payload.locationType = eventPost.locationType ?? "ne";
    if (eventPost.location) payload.location = eventPost.location;
    if (eventPost.urlLink) payload.urlLink = eventPost.urlLink;
    // Only include placeName/placeId if they are valid non-empty strings
    if (eventPost.placeName && eventPost.placeName.trim()) payload.placeName = eventPost.placeName.trim();
    if (eventPost.placeId && eventPost.placeId.trim() && eventPost.placeId.startsWith("Ch")) payload.placeId = eventPost.placeId.trim();
    if (eventPost.roomNum) payload.roomNum = eventPost.roomNum;
    if (eventPost.website) payload.website = eventPost.website;
    if (eventPost.contactEmail) payload.contactEmail = eventPost.contactEmail;
    if (eventPost.phone) payload.phone = eventPost.phone;
  } else {
    payload.locationType = "ne";
  }

  return payload;
}

export async function submitToCommunityHub(
  post: ReviewPost,
  adminEmail: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  const payload = buildCommunityHubPayload(post, adminEmail);

  const url = post.communityHubPostId
    ? `${CH_BASE}/post/${post.communityHubPostId}/submit`
    : `${CH_BASE}/post/submit`;

  const method = post.communityHubPostId ? "POST" : "POST";

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    return { success: false, error: body };
  }

  const data = await res.json();
  return {
    success: true,
    id: String(data.id ?? data.postId ?? data._id ?? ""),
  };
}
