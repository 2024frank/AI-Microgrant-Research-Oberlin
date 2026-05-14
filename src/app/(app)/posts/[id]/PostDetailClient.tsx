"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertTriangle, CheckCircle } from "lucide-react";

import { PostTypeBadge } from "@/components/PostTypeBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { ValidationBadge } from "@/components/ValidationBadge";
import { useReviewStore } from "@/context/ReviewStoreContext";
import type { LocationType, ReviewPost } from "@/lib/postTypes";
import { getCommunityHubPostTypeLabel } from "@/lib/postTypes";
import { validatePost } from "@/lib/postValidation";
import { clientGetReviewPost } from "@/lib/reviewStoreClient";

function FieldEditor({
  label,
  required,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
        {label} {required ? <span className="text-[#ffb4ab]">*</span> : null}
      </span>
      {multiline ? (
        <textarea
          className="mt-1 min-h-24 w-full rounded border border-[var(--border)] bg-[#131313] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[#a6192e]"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
      ) : (
        <input
          className="mt-1 w-full rounded border border-[var(--border)] bg-[#131313] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[#a6192e]"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
      )}
    </label>
  );
}

function formatSession(post: ReviewPost) {
  const session = post.sessions[0];

  if (!session?.startTime) {
    return "Not set";
  }

  const start = new Date(session.startTime * 1000).toLocaleString();
  const end = session.endTime ? new Date(session.endTime * 1000).toLocaleString() : "No end time";

  return `${start} - ${end}`;
}

function parseStringList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatUnixInput(value: number | null) {
  if (!value) {
    return "";
  }

  return new Date(value * 1000).toISOString().slice(0, 16);
}

function parseUnixInput(value: string) {
  if (!value) {
    return null;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.floor(time / 1000) : null;
}

export function PostDetailClient({ id }: { id: string }) {
  const { duplicateGroups, getPostById, updatePost, updatePostsStatus, refreshPosts } = useReviewStore();
  const storedPost = getPostById(id);
  const [remotePost, setRemotePost] = useState<ReviewPost | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(() => !storedPost);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const basePost = useMemo(() => storedPost ?? remotePost, [storedPost, remotePost]);

  const [draftPost, setDraftPost] = useState<ReviewPost | null>(basePost ?? null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [publishMessage, setPublishMessage] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" } | null>(null);
  const [confirmApproveDespiteErrors, setConfirmApproveDespiteErrors] = useState(false);
  const approveBypassHeadingId = "approve-bypass-heading";
  const approveBypassDescId = "approve-bypass-desc";

  function showToast(message: string, type: "error" | "success" = "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    if (storedPost) {
      setRemotePost(null);
      setRemoteLoading(false);
      setRemoteError(null);
      return;
    }

    let cancelled = false;
    setRemoteLoading(true);
    setRemoteError(null);
    void clientGetReviewPost(id)
      .then((p) => {
        if (cancelled) return;
        setRemotePost(p);
        if (!p) {
          setRemoteError("This post is not in the active queue. It may have been archived or removed.");
        }
        setRemoteLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setRemoteError(err instanceof Error ? err.message : "Failed to load post");
        setRemoteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, storedPost]);

  useEffect(() => {
    setDraftPost(basePost ?? null);
    setHasUnsavedChanges(false);
    setSaveMessage("");
  }, [basePost]);

  useEffect(() => {
    setRejectionReason(basePost?.rejectionReason ?? "");
  }, [basePost?.id, basePost?.rejectionReason]);

  const validation = useMemo(() => (draftPost ? validatePost(draftPost) : null), [draftPost]);

  useEffect(() => {
    if (validation?.isValid) {
      setConfirmApproveDespiteErrors(false);
    }
  }, [validation?.isValid]);

  const duplicatePosts = useMemo(() => {
    if (!draftPost?.duplicateGroupId) {
      return [];
    }

    const group = duplicateGroups.find((item) => item.id === draftPost.duplicateGroupId);
    return group?.postIds.filter((postId) => postId !== draftPost.id).map(getPostById).filter(Boolean) ?? [];
  }, [draftPost, duplicateGroups, getPostById]);

  if (!storedPost && remoteLoading) {
    return (
      <section className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-6 text-sm text-[var(--muted)]">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[var(--primary)]" aria-hidden />
        Loading post…
      </section>
    );
  }

  if (remoteError && !basePost) {
    return (
      <section className="rounded-lg border border-red-900/40 bg-red-950/20 p-6 text-sm text-red-200">
        <p>{remoteError}</p>
        <p className="mt-3">
          Return to <Link className="text-[#ffb3b3] underline" href="/posts">Content Queue</Link>.
        </p>
      </section>
    );
  }

  if (!basePost || !draftPost || !validation) {
    return (
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-6 text-sm text-[var(--muted)]">
        Post not found. Return to <Link className="text-[#ffb3b3]" href="/posts">Content Queue</Link>.
      </section>
    );
  }

  const post = draftPost;

  function update(updates: Partial<ReviewPost>) {
    if (!post || !validation) {
      return;
    }

    setDraftPost((current) => (current ? ({ ...current, ...updates } as ReviewPost) : current));
    setHasUnsavedChanges(true);
    setSaveMessage("");
  }

  function saveChanges() {
    if (!post) {
      return;
    }

    updatePost(post.id, post);
    setHasUnsavedChanges(false);
    setSaveMessage("Changes saved.");
  }

  async function saveFeedbackToAPI(
    decision: "approved" | "rejected" | "needs_correction",
    reason?: string,
    learningSignal?: string
  ) {
    if (!post) return;
    const { getClientJsonAuthHeaders } = await import("@/lib/clientAuthHeaders");
    const headers = await getClientJsonAuthHeaders();
    const res = await fetch("/api/posts/feedback", {
      method: "POST",
      headers,
      body: JSON.stringify({
        postId: post.id,
        postTitle: post.title,
        decision,
        rejectionReason: reason,
        postTypeId: post.postTypeId,
        eventType: post.eventType,
        aiConfidence: post.aiConfidence,
        sourceName: post.sourceName,
        learningSignal,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to save reviewer feedback");
    }
  }

  function approve() {
    if (!post || !validation) {
      return;
    }

    if (!validation.isValid && !confirmApproveDespiteErrors) {
      showToast("Required fields are missing. Confirm approval anyway below, or fix the fields first.");
      return;
    }

    if (hasUnsavedChanges) {
      updatePost(post.id, post);
      setHasUnsavedChanges(false);
    }

    const overrideReason = !validation.isValid
      ? `Human approved despite missing required fields: ${validation.missingFields.join(", ")}`
      : undefined;

    updatePostsStatus([post.id], "approved", overrideReason);
    void saveFeedbackToAPI(
      "approved",
      overrideReason,
      overrideReason ? "human_approved_missing_fields" : "human_approved"
    ).catch((err) => {
      showToast(err instanceof Error ? err.message : "Feedback save failed");
    });
  }

  async function publishToHub() {
    if (!post) return;
    setPublishing(true);
    setPublishMessage("");
    try {
      const { getClientJsonAuthHeaders } = await import("@/lib/clientAuthHeaders");
      const res = await fetch("/api/posts/publish", {
        method: "POST",
        headers: await getClientJsonAuthHeaders(),
        body: JSON.stringify({ postId: post.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Publish failed");
      setPublishMessage("Published to Community Hub.");
      showToast("Published to Community Hub successfully.", "success");
      updatePostsStatus([post.id], "published");
    } catch (err) {
      setPublishMessage(err instanceof Error ? err.message : "Publish failed.");
      showToast(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setPublishing(false);
    }
  }

  function reject() {
    if (!post) {
      return;
    }

    const reason = rejectionReason.trim();
    if (!reason) {
      showToast("Enter a rejection reason in the box below before rejecting.");
      return;
    }

    if (hasUnsavedChanges) {
      updatePost(post.id, post);
      setHasUnsavedChanges(false);
    }

    updatePostsStatus([post.id], "rejected", reason);
    void saveFeedbackToAPI("rejected", reason).catch((err) => {
      showToast(err instanceof Error ? err.message : "Feedback save failed");
    });
  }

  async function sendBackForCorrection() {
    if (!post) {
      return;
    }

    const reason = rejectionReason.trim();
    if (!reason) {
      showToast("Enter what needs to change before sending back.");
      return;
    }

    if (hasUnsavedChanges) {
      updatePost(post.id, post);
      setHasUnsavedChanges(false);
    }

    setCorrecting(true);
    try {
      const { getClientJsonAuthHeaders } = await import("@/lib/clientAuthHeaders");
      const res = await fetch("/api/posts/correct", {
        method: "POST",
        headers: await getClientJsonAuthHeaders(),
        body: JSON.stringify({ postId: post.id, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Correction failed");
      if (data.post) {
        setDraftPost(data.post);
        updatePost(post.id, data.post);
      }
      setHasUnsavedChanges(false);
      setRejectionReason("");
      await refreshPosts();
      showToast("Gemini revised the copy and returned it to review.", "success");
    } catch (err) {
      updatePostsStatus([post.id], "needs_correction", reason);
      showToast(err instanceof Error ? err.message : "Correction failed; saved as needs correction.");
    } finally {
      setCorrecting(false);
    }
  }

  function returnToReviewQueue() {
    if (!post) {
      return;
    }

    if (hasUnsavedChanges) {
      updatePost(post.id, post);
      setHasUnsavedChanges(false);
    }

    updatePostsStatus([post.id], "pending", "");
    void refreshPosts().then(() => {
      showToast("Returned to the review queue.", "success");
    });
  }

  return (
    <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-lg shadow-2xl border text-sm font-medium transition-all animate-in fade-in slide-in-from-top-2 duration-300 ${
          toast.type === "error"
            ? "bg-red-950 border-red-800 text-red-200"
            : "bg-teal-950 border-teal-700 text-teal-200"
        }`}>
          {toast.type === "error"
            ? <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            : <CheckCircle className="w-4 h-4 shrink-0 text-teal-400" />}
          {toast.message}
        </div>
      )}
      <main className="space-y-6">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <PostTypeBadge type={post.eventType === "ot" ? "event" : "announcement"} />
            <StatusBadge
              status={
                post.status === "needs_correction"
                  ? "flagged"
                  : (post.status as "pending" | "approved" | "rejected" | "archived" | "published" | "duplicate" | "flagged")
              }
            />
            <ValidationBadge result={validation} />
          </div>
          <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
            {post.title || "Untitled post"}
          </h1>
          <p className="mt-2 text-[var(--muted)]">{getCommunityHubPostTypeLabel(post.postTypeId)}</p>
        </div>

        {/* Side-by-side description comparison */}
        {post.originalDescription && (
          <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--text)]">Description Comparison</span>
              <span className="text-xs text-[var(--muted)]">— original from Localist vs. Editor Agent rewrite</span>
            </div>
            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border)]">
              <div className="p-5">
                <p className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)] mb-2">
                  Original (Localist)
                </p>
                <p className="text-sm text-[var(--muted)] leading-relaxed whitespace-pre-wrap">
                  {post.originalDescription}
                </p>
              </div>
              <div className="p-5">
                <p className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-teal-400 mb-2">
                  Editor Agent Rewrite ✦
                </p>
                <p className="text-sm text-[var(--text)] leading-relaxed mb-3">
                  {post.description}
                </p>
                {post.extendedDescription && (
                  <>
                    <p className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-teal-400 mb-2 mt-4">
                      Extended Description
                    </p>
                    <p className="text-sm text-[var(--text)] leading-relaxed">
                      {post.extendedDescription}
                    </p>
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
          <h2 className="font-[var(--font-public-sans)] text-xl font-semibold">Community Hub Required Fields</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Post type, display routing, and screen IDs are internal setup values. Reviewers only need to verify the fields below.
          </p>
          <div className="mt-5 grid gap-4">
            <FieldEditor label="Title" required value={post.title} onChange={(title) => update({ title })} />
            <FieldEditor label="Short Description" required multiline value={post.description} onChange={(description) => update({ description })} />
            <FieldEditor label="Extended Description" multiline value={post.extendedDescription ?? ""} onChange={(extendedDescription) => update({ extendedDescription })} />
            <FieldEditor label="Email" required value={post.email} onChange={(email) => update({ email })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldEditor label="Contact Email" value={"contactEmail" in post ? (post.contactEmail || "") : ""} onChange={(contactEmail) => update({ contactEmail })} />
              <FieldEditor label="Phone Number" value={"phone" in post ? ((post as {phone?: string}).phone || "") : ""} onChange={(phone) => update({ phone } as Partial<typeof post>)} />
            </div>
            <FieldEditor label="Sponsors" required value={post.sponsors.join(", ")} onChange={(value) => update({ sponsors: parseStringList(value) })} />
            <FieldEditor label="Image URL" required value={post.imageUrl || ""} onChange={(imageUrl) => update({ imageUrl })} />
            {post.imageUrl ? (
              <img
                alt={`Preview for ${post.title}`}
                className="max-h-56 w-full rounded border border-[var(--border)] object-cover"
                src={post.imageUrl}
              />
            ) : (
              <p className="rounded border border-dashed border-[var(--border)] p-3 text-sm text-[var(--muted)]">
                No image attached yet. Add an image URL when Community Hub requires a visual.
              </p>
            )}

            {!validation.isValid ? (
              <div
                className="rounded-md border border-amber-800/45 bg-amber-950/25 p-4"
                role="region"
                aria-labelledby={approveBypassHeadingId}
              >
                <h3 id={approveBypassHeadingId} className="font-[var(--font-public-sans)] text-sm font-semibold text-amber-100">
                  Required fields incomplete
                </h3>
                <p id={approveBypassDescId} className="mt-1 text-xs text-[var(--muted)] leading-relaxed">
                  Community Hub may reject or mis-handle incomplete payloads. You can still mark the post approved in this queue if you accept that risk.
                </p>
                <label className="mt-3 flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 rounded border border-[var(--border)] accent-[#a6192e]"
                    checked={confirmApproveDespiteErrors}
                    onChange={(e) => setConfirmApproveDespiteErrors(e.target.checked)}
                    aria-describedby={approveBypassDescId}
                  />
                  <span className="text-sm text-[var(--text)] leading-snug">
                    I understand required Community Hub fields are missing and I still want to approve this post.
                  </span>
                </label>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4">
              <button
                className="rounded border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--surface-high)] disabled:opacity-50"
                disabled={!hasUnsavedChanges}
                onClick={saveChanges}
                type="button"
              >
                Save Draft
              </button>
              <button
                className="rounded bg-[#a6192e] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={!validation?.isValid && !confirmApproveDespiteErrors}
                onClick={() => {
                  if (hasUnsavedChanges) saveChanges();
                  approve();
                }}
                type="button"
              >
                Save & Approve
              </button>
              <span className="text-sm text-[var(--muted)]">
                {hasUnsavedChanges ? "Unsaved edits." : saveMessage || ""}
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
          <h2 className="font-[var(--font-public-sans)] text-xl font-semibold">Session Fields</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
                Start Time *
              </span>
              <input
                className="mt-1 w-full rounded border border-[var(--border)] bg-[#131313] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[#a6192e]"
                onChange={(event) => update({ sessions: [{ ...(post.sessions[0] ?? {}), startTime: parseUnixInput(event.target.value) }] })}
                type="datetime-local"
                value={formatUnixInput(post.sessions[0]?.startTime ?? null)}
              />
            </label>
            <label className="block">
              <span className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
                End Time *
              </span>
              <input
                className="mt-1 w-full rounded border border-[var(--border)] bg-[#131313] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[#a6192e]"
                onChange={(event) => update({ sessions: [{ ...(post.sessions[0] ?? {}), endTime: parseUnixInput(event.target.value) }] })}
                type="datetime-local"
                value={formatUnixInput(post.sessions[0]?.endTime ?? null)}
              />
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
          <h2 className="font-[var(--font-public-sans)] text-xl font-semibold">Post Type Fields</h2>
          <div className="mt-5 grid gap-4">
            {post.eventType === "ot" ? (
              <>
                <FieldEditor label="Physical Location" required={post.locationType === "ph2" || post.locationType === "bo"} value={post.location || ""} onChange={(location) => update({ location, locationType: (post.urlLink ? "bo" : "ph2") as LocationType })} />
                <FieldEditor label="Online Event URL" required={post.locationType === "on" || post.locationType === "bo"} value={post.urlLink || ""} onChange={(urlLink) => update({ urlLink, locationType: (post.location ? "bo" : "on") as LocationType })} />
                <FieldEditor label="Place Name" value={post.placeName || ""} onChange={(placeName) => update({ placeName })} />
                <FieldEditor label="Room Number" value={post.roomNum || ""} onChange={(roomNum) => update({ roomNum })} />
                <FieldEditor label="Website" value={post.website || ""} onChange={(website) => update({ website })} />
                <FieldEditor label="Contact Email" value={post.contactEmail || ""} onChange={(contactEmail) => update({ contactEmail })} />
              </>
            ) : null}
            {post.eventType === "an" ? (
              <>
                <FieldEditor label="Website" value={post.website || ""} onChange={(website) => update({ website })} />
                <FieldEditor label="Contact Email" value={post.contactEmail || ""} onChange={(contactEmail) => update({ contactEmail })} />
              </>
            ) : null}
          </div>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div><dt className="text-[var(--muted)]">Sessions *</dt><dd>{formatSession(post)}</dd></div>
            <div><dt className="text-[var(--muted)]">Source Name</dt><dd>{post.sourceName || "Not set"}</dd></div>
            <div><dt className="text-[var(--muted)]">Source URL</dt><dd>{post.sourceUrl ? <a className="text-[#ffb3b3]" href={post.sourceUrl} rel="noreferrer" target="_blank">{post.sourceUrl}</a> : "Not set"}</dd></div>
            {post.eventType === "ot" ? (
              <>
                <div><dt className="text-[var(--muted)]">Physical Location</dt><dd>{post.location || "Not set"}</dd></div>
                <div><dt className="text-[var(--muted)]">Online Event URL</dt><dd>{post.urlLink || "Not set"}</dd></div>
              </>
            ) : null}
            {post.eventType === "an" ? (
              <>
                <div><dt className="text-[var(--muted)]">Announcement Date</dt><dd>{formatSession(post)}</dd></div>
                <div><dt className="text-[var(--muted)]">Contact Email</dt><dd>{post.contactEmail || "Not set"}</dd></div>
                <div><dt className="text-[var(--muted)]">Website</dt><dd>{post.website || "Not set"}</dd></div>
              </>
            ) : null}
          </dl>
        </section>

        {/* Payload Preview */}
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <h2 className="font-[var(--font-public-sans)] text-xl font-semibold">Community Hub Payload</h2>
            <span className="text-xs text-[var(--muted)]">What will be submitted</span>
          </div>
          <div className="p-5 space-y-2 text-xs font-mono">
            {[
              { key: "eventType", value: post.eventType, required: true },
              { key: "title", value: post.title, required: true },
              { key: "email", value: post.email, required: true },
              { key: "contactEmail", value: "contactEmail" in post ? post.contactEmail : undefined, required: false },
              { key: "phone", value: "phone" in post ? (post as {phone?: string}).phone : undefined, required: false },
              { key: "description", value: post.description, required: true },
              { key: "extendedDescription", value: post.extendedDescription, required: false },
              { key: "sponsors", value: post.sponsors?.join(", "), required: true },
              { key: "postTypeId", value: `[${post.postTypeId?.join(", ")}]`, required: true },
              { key: "sessions", value: post.sessions?.[0]?.startTime ? `[{startTime: ${post.sessions[0].startTime}, endTime: ${post.sessions[0].endTime}}]` : undefined, required: true },
              { key: "locationType", value: "locationType" in post ? post.locationType : "ne", required: true },
              { key: "location", value: "location" in post ? post.location : undefined, required: post.eventType === "ot" && "locationType" in post && (post.locationType === "ph2" || post.locationType === "bo") },
              { key: "urlLink", value: "urlLink" in post ? post.urlLink : undefined, required: post.eventType === "ot" && "locationType" in post && (post.locationType === "on" || post.locationType === "bo") },
              { key: "roomNum", value: "roomNum" in post ? (post as {roomNum?: string}).roomNum : undefined, required: false },
              { key: "calendarSourceName", value: post.calendarSourceName, required: false },
              { key: "calendarSourceUrl", value: post.calendarSourceUrl, required: false },
              { key: "image_cdn_url", value: post.image_cdn_url || post.imageUrl, required: false },
            ].map(({ key, value, required }) => {
              const filled = value !== undefined && value !== "" && value !== "[]" && value !== null;
              const missing = required && !filled;
              return (
                <div key={key} className={`flex gap-2 py-0.5 rounded px-1 ${missing ? "bg-red-900/20" : ""}`}>
                  <span className={`shrink-0 w-40 ${missing ? "text-red-400" : "text-[var(--muted)]"}`}>
                    {required ? "* " : "  "}{key}:
                  </span>
                  <span className={`truncate ${!filled ? "text-[var(--muted)] italic" : "text-teal-300"}`}>
                    {filled ? String(value).slice(0, 60) + (String(value).length > 60 ? "…" : "") : "— missing —"}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="px-5 py-2 border-t border-[var(--border)] text-xs text-[var(--muted)]">
            <span className="text-red-400 mr-3">* required</span>
            <span className="text-teal-300 mr-3">■ filled</span>
            <span className="italic">— missing —</span>
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
          <h2 className="font-[var(--font-public-sans)] text-xl font-semibold">Validation Messages</h2>
          {validation.errors.length === 0 && validation.warnings.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">All required fields are ready for approval.</p>
          ) : (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
              {[...validation.errors, ...validation.warnings].map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <aside className="space-y-4">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
          <h2 className="font-[var(--font-public-sans)] text-lg font-semibold">AI Extraction Summary</h2>
          <p className="mt-3 text-sm text-[var(--muted)]">
            Confidence: {post.aiConfidence === null ? "—" : `${Math.round(Number(post.aiConfidence) * 100)}%`}
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">{post.extractedMetadata.notes || "No extraction notes."}</p>
        </section>
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
          <h2 className="font-[var(--font-public-sans)] text-lg font-semibold">Source Attribution</h2>
          <p className="mt-3 text-sm text-[var(--muted)]">{post.sourceName}</p>
          <a className="mt-2 block text-sm text-[#ffb3b3]" href={post.sourceUrl} rel="noreferrer" target="_blank">
            Original source link
          </a>
        </section>
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
          <h2 className="font-[var(--font-public-sans)] text-lg font-semibold">Duplicate Warnings</h2>
          {duplicatePosts.length > 0 ? (
            <div className="mt-3 space-y-2 text-sm">
              <p className="text-[var(--muted)]">{post.duplicateWarning || "This post is part of a duplicate group."}</p>
              {duplicatePosts.map((duplicatePost) =>
                duplicatePost ? (
                  <Link
                    className="block rounded border border-[var(--border)] p-3 text-[#ffb3b3] hover:bg-[var(--surface-high)]"
                    href={`/posts/${duplicatePost.id}`}
                    key={duplicatePost.id}
                  >
                    Duplicate of: {duplicatePost.title}
                    <span className="block text-xs text-[var(--muted)]">{duplicatePost.id}</span>
                  </Link>
                ) : null,
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--muted)]">No duplicate warnings.</p>
          )}
        </section>
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
          <h2 className="font-[var(--font-public-sans)] text-lg font-semibold">Extraction Metadata</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div><dt className="text-[var(--muted)]">Extracted At</dt><dd>{post.extractedMetadata.extractedAt}</dd></div>
            <div><dt className="text-[var(--muted)]">Model</dt><dd>{post.extractedMetadata.model}</dd></div>
            <div><dt className="text-[var(--muted)]">Source Record</dt><dd>{post.extractedMetadata.sourceRecordId || "Not set"}</dd></div>
          </dl>
        </section>
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
          <h2 className="font-[var(--font-public-sans)] text-lg font-semibold">Review Decision</h2>
          {post.status === "needs_correction" && post.rejectionReason ? (
            <div
              className="mt-3 rounded-md border border-amber-800/45 bg-amber-950/25 p-3 text-sm text-amber-50"
              role="status"
            >
              <p className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-wide text-amber-200/90">
                Reviewer feedback
              </p>
              <p className="mt-2 whitespace-pre-wrap leading-relaxed">{post.rejectionReason}</p>
            </div>
          ) : null}
          {!validation.isValid ? (
            <div
              className="mt-3 rounded-md border border-amber-800/45 bg-amber-950/25 p-3"
              role="region"
              aria-labelledby={`${approveBypassHeadingId}-aside`}
            >
              <h3 id={`${approveBypassHeadingId}-aside`} className="text-xs font-semibold uppercase tracking-wide text-amber-100">
                Incomplete required fields
              </h3>
              <label className="mt-2 flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border border-[var(--border)] accent-[#a6192e]"
                  checked={confirmApproveDespiteErrors}
                  onChange={(e) => setConfirmApproveDespiteErrors(e.target.checked)}
                  aria-describedby={approveBypassDescId}
                />
                <span className="text-xs text-[var(--text)] leading-snug">
                  Approve anyway (same as main form).
                </span>
              </label>
            </div>
          ) : null}
          <textarea
            aria-label="Rejection or correction notes"
            className="mt-3 min-h-20 w-full rounded border border-[var(--border)] bg-[#131313] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[#a6192e]"
            onChange={(event) => setRejectionReason(event.target.value)}
            placeholder="Required for Reject or Send Back — what should change?"
            value={rejectionReason}
          />
          <div className="mt-3 grid gap-2">
            {post.status === "approved" && (
              <>
                <button
                  className="flex items-center justify-center gap-2 rounded bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
                  disabled={publishing}
                  onClick={publishToHub}
                  type="button"
                >
                  {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Publish to Community Hub
                </button>
                {publishMessage && (
                  <p className="text-xs text-teal-400">{publishMessage}</p>
                )}
              </>
            )}
            {post.status !== "published" && (
              <>
                <button className="rounded bg-[#a6192e] px-3 py-2 text-sm font-semibold text-white" onClick={approve} type="button">Approve</button>
                <button className="rounded border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-high)]" onClick={reject} type="button">Reject</button>
                <button
                  className="flex items-center justify-center gap-2 rounded border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-high)] disabled:opacity-50"
                  disabled={correcting}
                  onClick={sendBackForCorrection}
                  type="button"
                >
                  {correcting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {correcting ? "Correcting with AI" : "Send Back / Needs Correction"}
                </button>
                {post.status === "needs_correction" ? (
                  <button
                    className="rounded border border-teal-800/50 bg-teal-950/30 px-3 py-2 text-sm font-medium text-teal-100 hover:bg-teal-900/35"
                    onClick={returnToReviewQueue}
                    type="button"
                  >
                    Submit corrections — return to queue
                  </button>
                ) : null}
                <button
                  className="rounded border border-red-900/50 px-3 py-2 text-sm text-red-400 hover:bg-red-900/20"
                  onClick={() => {
                    updatePostsStatus([post.id], "archived");
                    void saveFeedbackToAPI("rejected", "Deleted by reviewer").catch((err) => {
                      showToast(err instanceof Error ? err.message : "Feedback save failed");
                    });
                  }}
                  type="button"
                >
                  Delete
                </button>
              </>
            )}
            {post.status === "published" && (
              <p className="text-sm text-teal-400 text-center py-2">
                ✓ Published to Community Hub{post.communityHubPostId ? ` (ID: ${post.communityHubPostId})` : ""}
              </p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
