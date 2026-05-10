"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { PostTypeBadge } from "@/components/PostTypeBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { ValidationBadge } from "@/components/ValidationBadge";
import { useReviewStore } from "@/context/ReviewStoreContext";
import type { LocationType, ReviewPost } from "@/lib/postTypes";
import { getCommunityHubPostTypeLabel } from "@/lib/postTypes";
import { validatePost } from "@/lib/postValidation";

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
  const { duplicateGroups, getPostById, updatePost, updatePostsStatus } = useReviewStore();
  const storedPost = getPostById(id);
  const [draftPost, setDraftPost] = useState<ReviewPost | null>(storedPost ?? null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState("");

  useEffect(() => {
    setDraftPost(storedPost ?? null);
    setHasUnsavedChanges(false);
    setSaveMessage("");
  }, [storedPost?.id, storedPost]);

  const validation = useMemo(() => (draftPost ? validatePost(draftPost) : null), [draftPost]);
  const duplicatePosts = useMemo(() => {
    if (!draftPost?.duplicateGroupId) {
      return [];
    }

    const group = duplicateGroups.find((item) => item.id === draftPost.duplicateGroupId);
    return group?.postIds.filter((postId) => postId !== draftPost.id).map(getPostById).filter(Boolean) ?? [];
  }, [draftPost, duplicateGroups, getPostById]);

  if (!storedPost || !draftPost || !validation) {
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

  async function saveFeedbackToAPI(decision: "approved" | "rejected" | "needs_correction", reason?: string) {
    if (!post) return;
    try {
      await fetch("/api/posts/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: post.id,
          postTitle: post.title,
          decision,
          rejectionReason: reason,
          postTypeId: post.postTypeId,
          eventType: post.eventType,
          aiConfidence: post.aiConfidence,
          sourceName: post.sourceName,
        }),
      });
    } catch { /* non-blocking */ }
  }

  function approve() {
    if (!post || !validation) {
      return;
    }

    if (!validation.isValid) {
      window.alert("Required fields are missing. Resolve validation errors before approval.");
      return;
    }

    if (hasUnsavedChanges) {
      updatePost(post.id, post);
      setHasUnsavedChanges(false);
    }

    updatePostsStatus([post.id], "approved");
    saveFeedbackToAPI("approved");
  }

  async function publishToHub() {
    if (!post) return;
    setPublishing(true);
    setPublishMessage("");
    try {
      const res = await fetch("/api/posts/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Publish failed");
      setPublishMessage("Published to Community Hub.");
      updatePostsStatus([post.id], "published");
    } catch (err) {
      setPublishMessage(err instanceof Error ? err.message : "Publish failed.");
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
      window.alert("Enter a rejection reason before rejecting this post.");
      return;
    }

    if (hasUnsavedChanges) {
      updatePost(post.id, post);
      setHasUnsavedChanges(false);
    }

    updatePostsStatus([post.id], "rejected", reason);
    saveFeedbackToAPI("rejected", reason);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
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
                disabled={!validation?.isValid}
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
          <textarea
            className="mt-3 min-h-20 w-full rounded border border-[var(--border)] bg-[#131313] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[#a6192e]"
            onChange={(event) => setRejectionReason(event.target.value)}
            placeholder="Rejection reason"
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
                <button className="rounded border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-high)]" onClick={() => { updatePostsStatus([post.id], "needs_correction"); saveFeedbackToAPI("needs_correction", rejectionReason || undefined); }} type="button">Send Back / Needs Correction</button>
                <button className="rounded border border-red-900/50 px-3 py-2 text-sm text-red-400 hover:bg-red-900/20" onClick={() => { updatePostsStatus([post.id], "archived"); saveFeedbackToAPI("rejected", "Deleted by reviewer"); }} type="button">Delete</button>
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
