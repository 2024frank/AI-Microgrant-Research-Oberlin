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

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isDuplicateOfCHPost(
  post: ReviewPost,
  chPosts: CHPost[]
): CHPost | null {
  const startTime =
    post.sessions?.[0]?.startTime != null
      ? Number(post.sessions[0].startTime)
      : null;
  const postTitle = normalizeTitle(post.title);
  const postLocation =
    "location" in post ? (post.location ?? "").toLowerCase() : "";

  for (const chPost of chPosts) {
    const chTitle = normalizeTitle(chPost.title);

    // Exact or near-exact title match (regardless of time)
    if (postTitle.length > 5 && chTitle.length > 5) {
      if (postTitle === chTitle) return chPost;
      if (postTitle.includes(chTitle) || chTitle.includes(postTitle)) return chPost;
    }

    // Time-based matching: same start time (±2 hours) + partial title overlap
    if (chPost.startTime && startTime !== null) {
      const timeDiff = Math.abs(chPost.startTime - startTime);
      if (timeDiff <= 7200) {
        // Same time window — check title similarity
        const titleOverlap =
          postTitle.slice(0, 15) === chTitle.slice(0, 15) ||
          postTitle.includes(chTitle.slice(0, 12)) ||
          chTitle.includes(postTitle.slice(0, 12));

        if (titleOverlap) return chPost;

        // Same time + same location
        const chLocation = (chPost.location ?? "").toLowerCase();
        const locationMatch =
          postLocation.length > 3 &&
          chLocation.length > 3 &&
          (postLocation.includes(chLocation.slice(0, 10)) ||
            chLocation.includes(postLocation.slice(0, 10)));

        if (locationMatch) return chPost;
      }
    }
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
    const hasValidPlaceId = !!(eventPost.placeId?.trim()?.startsWith("Ch"));
    const hasOnlineLink = !!eventPost.urlLink;
    const hasPhysicalLocation = !!eventPost.location;

    // Community Hub tries to auto-resolve Google Place ID when locationType is ph2/bo.
    // If resolution fails it calls setGooglePlaceId(null) which throws a PHP type error.
    // Only use ph2/bo if we have a real Google Place ID. Otherwise use ne/on.
    let locationType: string;
    if (hasValidPlaceId && hasPhysicalLocation && hasOnlineLink) locationType = "bo";
    else if (hasValidPlaceId && hasPhysicalLocation) locationType = "ph2";
    else if (hasOnlineLink) locationType = "on";
    else locationType = "ne";

    payload.locationType = locationType;

    // For online/hybrid
    if (hasOnlineLink) payload.urlLink = eventPost.urlLink;

    // For physical with valid Place ID only
    if (hasValidPlaceId && hasPhysicalLocation) {
      payload.location = eventPost.location;
      payload.placeId = eventPost.placeId!.trim();
      if (eventPost.placeName?.trim()) payload.placeName = eventPost.placeName.trim();
    }

    if (eventPost.roomNum) payload.roomNum = eventPost.roomNum;
    if (eventPost.website) payload.website = eventPost.website;
    if (eventPost.contactEmail) payload.contactEmail = eventPost.contactEmail;
    if (eventPost.phone) payload.phone = eventPost.phone;

    // Add location to extendedDescription when we can't use ph2
    if (!hasValidPlaceId && hasPhysicalLocation && eventPost.location) {
      const locationNote = `\n\nLocation: ${eventPost.location}${eventPost.roomNum ? `, ${eventPost.roomNum}` : ""}`;
      payload.extendedDescription = ((payload.extendedDescription as string) || "") + locationNote;
    }
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
