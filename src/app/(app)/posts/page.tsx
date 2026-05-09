"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { PostTypeBadge } from "@/components/PostTypeBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { ValidationBadge } from "@/components/ValidationBadge";
import { useReviewStore } from "@/context/ReviewStoreContext";
import type { ReviewPost, ReviewStatus } from "@/lib/postTypes";
import { getPostTypeLabel } from "@/lib/postTypes";
import { validatePost } from "@/lib/postValidation";

type BulkAction = ReviewStatus | "delete";

export default function PostsPage() {
  const { posts, removePosts, updatePostsStatus } = useReviewStore();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<BulkAction | null>(null);
  const canDeletePost = (post: ReviewPost) => post.status === "rejected" || post.status === "archived";
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
      removePosts(selectedDeletableIds);
    } else {
      updatePostsStatus(selectedIds, action);
    }
    setSelectedIds([]);
    setConfirmAction(null);
  }

  function approvePost(post: ReviewPost) {
    const validation = validatePost(post);

    if (!validation.isValid) {
      window.alert("Required fields are missing. Open details to resolve validation errors.");
      return;
    }

    updatePostsStatus([post.id], "approved");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
          Content Queue
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Review events and announcements before publishing.
        </p>
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
        <button className="rounded border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-high)] disabled:opacity-50" disabled={selectedIds.length === 0} onClick={() => setConfirmAction("archived")} type="button">
          Archive Selected
        </button>
        <button
          className="rounded border border-[#82303b] px-3 py-2 text-sm text-[#ffb3b3] hover:bg-[#82303b]/20 disabled:opacity-50"
          disabled={selectedDeletableIds.length === 0}
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
              {posts.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-[var(--muted)]" colSpan={9}>
                    No posts found. Connect sources or run an extraction to populate this queue.
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
                        <p className="mt-1 text-xs text-[var(--muted)]">{getPostTypeLabel(post.eventType)}</p>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={post.status === "needs_correction" ? "flagged" : post.status} /></td>
                      <td className="px-4 py-3">{post.sourceName}</td>
                      <td className="px-4 py-3">{post.aiConfidence === null ? "Needs analysis" : `${post.aiConfidence}%`}</td>
                      <td className="px-4 py-3">{firstSession?.startTime ? new Date(firstSession.startTime * 1000).toLocaleDateString() : "Not set"}</td>
                      <td className="px-4 py-3"><ValidationBadge result={validation} /></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--surface-high)]" href={`/posts/${post.id}`}>
                            View Details
                          </Link>
                          <button className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--surface-high)]" onClick={() => approvePost(post)} type="button">
                            Approve
                          </button>
                          <button className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--surface-high)]" onClick={() => updatePostsStatus([post.id], "rejected", "Rejected from queue.")} type="button">
                            Reject
                          </button>
                          <button
                            className="rounded border border-[#82303b] px-2 py-1 text-xs text-[#ffb3b3] hover:bg-[#82303b]/20 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!canDeletePost(post)}
                            onClick={() => removePosts([post.id])}
                            title={canDeletePost(post) ? "Delete this post" : "Only rejected or archived posts can be deleted"}
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
                ? `Permanently delete ${selectedDeletableIds.length} rejected/archived selected posts from local queue data?`
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
