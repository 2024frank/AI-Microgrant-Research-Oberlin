"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";

import { PostTypeBadge } from "@/components/PostTypeBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { ValidationBadge } from "@/components/ValidationBadge";
import { useReviewStore } from "@/context/ReviewStoreContext";
import type { ReviewPost, ReviewStatus } from "@/lib/postTypes";
import { getCommunityHubPostTypeLabel } from "@/lib/postTypes";
import { validatePost } from "@/lib/postValidation";

type BulkAction = ReviewStatus | "delete";

export default function PostsPage() {
  const { posts, removePosts, updatePostsStatus, loading, refreshPosts } = useReviewStore();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<BulkAction | null>(null);
  const [inlineMessage, setInlineMessage] = useState<{ id: string; text: string } | null>(null);
  const canDeletePost = (_post: ReviewPost) => true;

  // Always auto-refresh every 5s so posts appear as pipeline adds them
  useEffect(() => {
    const interval = setInterval(() => refreshPosts(), 5000);
    return () => clearInterval(interval);
  }, [refreshPosts]);
  const selectedPosts = useMemo(
    () => posts.filter((post) => selectedIds.includes(post.id)),
    [posts, selectedIds],
  );
  const selectedDeletableIds = useMemo(
    () => selectedPosts.filter(canDeletePost).map((post) => post.id),
    [selectedPosts],
  );

  function togglePost(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id],
    );
  }

  function selectAll() {
    setSelectedIds(posts.map((post) => post.id));
  }

  function applyBulkAction(action: BulkAction) {
    if (action === "delete") {
      removePosts(selectedIds);
    } else {
      updatePostsStatus(selectedIds, action);
    }
    setSelectedIds([]);
    setConfirmAction(null);
  }

  async function approvePost(post: ReviewPost) {
    const validation = validatePost(post);
    if (validation.errors.length > 0) {
      setInlineMessage({ id: post.id, text: "Missing required fields — open View Details to fix." });
      setTimeout(() => setInlineMessage(null), 4000);
      return;
    }

    // Mark approved first so the publish API accepts it
    updatePostsStatus([post.id], "approved");
    setInlineMessage({ id: post.id, text: "Publishing to Community Hub…" });

    try {
      const res = await fetch("/api/posts/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id }),
      });
      const data = await res.json();
      if (res.ok) {
        updatePostsStatus([post.id], "published");
        setInlineMessage({ id: post.id, text: "✓ Published to Community Hub" });
      } else {
        setInlineMessage({ id: post.id, text: `Publish failed: ${data.error ?? "unknown error"}` });
      }
    } catch {
      setInlineMessage({ id: post.id, text: "Publish failed — check your connection." });
    }
    setTimeout(() => setInlineMessage(null), 5000);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
            Content Queue
          </h1>
          <p className="mt-2 text-[var(--muted)]">
            Review events and announcements before publishing.
            {posts.length > 0 && <span className="ml-2 text-[var(--text)] font-medium">{posts.length} total</span>}
          </p>
        </div>
        <button
          onClick={() => refreshPosts()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--border)] text-sm text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-high)] disabled:opacity-50 transition-colors shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <section className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
        <button className="rounded border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-high)]" onClick={selectAll} type="button">
          Select All
        </button>
        <button className="rounded bg-[#a6192e] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={selectedIds.length === 0} onClick={() => setConfirmAction("approved")} type="button">
          Approve Selected
        </button>
        <button className="rounded border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-high)] disabled:opacity-50" disabled={selectedIds.length === 0} onClick={() => setConfirmAction("rejected")} type="button">
          Reject Selected
        </button>
        <button
          className="rounded border border-[#82303b] px-3 py-2 text-sm text-[#ffb3b3] hover:bg-[#82303b]/20 disabled:opacity-50"
          disabled={selectedIds.length === 0}
          onClick={() => setConfirmAction("delete")}
          type="button"
        >
          Delete Selected
        </button>
        <button className="rounded border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-high)] disabled:opacity-50" disabled={selectedIds.length === 0} onClick={() => setSelectedIds([])} type="button">
          Clear Selection
        </button>
        <span className="text-sm text-[var(--muted)]">{selectedIds.length} selected</span>
      </section>

      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)]">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-[var(--surface-high)]">
              <tr>
                {["", "Title", "Post Type", "Status", "Source", "AI Confidence", "Date", "Validation", "Actions"].map((header) => (
                  <th className="border-b border-[var(--border)] px-4 py-2 font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]" key={header}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-[var(--muted)]" colSpan={9}>
                    Loading posts…
                  </td>
                </tr>
              ) : posts.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-[var(--muted)]" colSpan={9}>
                    No posts found. Go to Sources and run the pipeline to populate this queue.
                  </td>
                </tr>
              ) : (
                posts.map((post) => {
                  const validation = validatePost(post);
                  const firstSession = post.sessions[0];

                  return (
                    <tr className="border-b border-[var(--border)] last:border-b-0 hover:bg-white/[0.03]" key={post.id}>
                      <td className="px-4 py-3">
                        <input
                          aria-label={`Select ${post.title}`}
                          checked={selectedIds.includes(post.id)}
                          onChange={() => togglePost(post.id)}
                          type="checkbox"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link className="font-semibold text-[#ffb3b3] hover:text-[#ffdad9]" href={`/posts/${post.id}`}>
                          {post.title}
                        </Link>
                        <p className="text-xs text-[var(--muted)]">{post.description}</p>
                      </td>
                      <td className="px-4 py-3">
                        <PostTypeBadge type={post.eventType === "ot" ? "event" : "announcement"} />
                        <p className="mt-1 text-xs text-[var(--muted)]">{getCommunityHubPostTypeLabel(post.postTypeId)}</p>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={post.status === "needs_correction" ? "flagged" : post.status as "pending" | "approved" | "rejected" | "archived" | "published" | "duplicate" | "flagged"} /></td>
                      <td className="px-4 py-3">{post.sourceName}</td>
                      <td className="px-4 py-3">{post.aiConfidence === null ? "—" : `${Math.round(Number(post.aiConfidence) * 100)}%`}</td>
                      <td className="px-4 py-3">{firstSession?.startTime ? new Date(firstSession.startTime * 1000).toLocaleDateString() : "Not set"}</td>
                      <td className="px-4 py-3"><ValidationBadge result={validation} /></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--surface-high)]" href={`/posts/${post.id}`}>
                            View Details
                          </Link>
                          <button className="rounded border border-teal-800 px-2 py-1 text-xs text-teal-400 hover:bg-teal-900/20" onClick={() => approvePost(post)} type="button">
                            Approve
                          </button>
                          <button className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--surface-high)]" onClick={() => updatePostsStatus([post.id], "rejected", "Rejected from queue.")} type="button">
                            Reject
                          </button>
                          {inlineMessage?.id === post.id && (
                            <span className="text-xs text-amber-400 self-center">{inlineMessage.text}</span>
                          )}
                          <button
                            className="rounded border border-[#82303b] px-2 py-1 text-xs text-[#ffb3b3] hover:bg-[#82303b]/20 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={false}
                            onClick={() => removePosts([post.id])}
                            title="Delete this post"
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {confirmAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <section className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
            <h2 className="font-[var(--font-public-sans)] text-xl font-semibold">Confirm bulk action</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {confirmAction === "delete"
                ? `Permanently delete ${selectedIds.length} selected posts?`
                : `Apply ${confirmAction.replace("_", " ")} to ${selectedPosts.length} selected posts?`}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded border border-[var(--border)] px-3 py-2 text-sm" onClick={() => setConfirmAction(null)} type="button">
                Cancel
              </button>
              <button className="rounded bg-[#a6192e] px-3 py-2 text-sm font-semibold text-white" onClick={() => applyBulkAction(confirmAction)} type="button">
                Confirm
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
