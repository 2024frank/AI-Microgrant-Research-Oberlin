"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PostTypeBadge } from "@/components/PostTypeBadge";
import { StatusBadge } from "@/components/StatusBadge";
import type { ReviewPost } from "@/lib/postTypes";
import { getCommunityHubPostTypeLabel } from "@/lib/postTypes";

const ARCHIVE_STATUSES = ["approved", "rejected", "published"];

export default function ArchivePage() {
  const [posts, setPosts] = useState<ReviewPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    import("@/lib/reviewStoreClient")
      .then(({ listReviewPosts }) => listReviewPosts({ maxResults: 500 }))
      .then((all) => setPosts(all.filter((p) => ARCHIVE_STATUSES.includes(p.status))))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
            Archive
          </h1>
          <p className="mt-2 text-[var(--muted)]">
            Approved, rejected, and published posts.
            {posts.length > 0 && <span className="ml-2 text-[var(--text)] font-medium">{posts.length} total</span>}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)]">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-[var(--surface-high)]">
              <tr>
                {["Title", "Type", "Status", "Source", "Date", ""].map((h) => (
                  <th key={h} className="border-b border-[var(--border)] px-4 py-2 font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--muted)]">Loading…</td></tr>
              ) : posts.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--muted)]">No archived posts yet. Approved posts will appear here.</td></tr>
              ) : (
                posts.map((post) => (
                  <tr key={post.id} className="border-b border-[var(--border)] last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <Link href={`/posts/${post.id}`} className="font-semibold text-[var(--text)] hover:text-[var(--primary)]">
                        {post.title}
                      </Link>
                      <p className="text-xs text-[var(--muted)] mt-0.5">{getCommunityHubPostTypeLabel(post.postTypeId)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <PostTypeBadge type={post.eventType === "ot" ? "event" : "announcement"} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={post.status as "approved" | "rejected" | "published"} />
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">{post.sourceName}</td>
                    <td className="px-4 py-3 text-[var(--muted)] tabular-nums">
                      {post.sessions?.[0]?.startTime
                        ? new Date(Number(post.sessions[0].startTime) * 1000).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/posts/${post.id}`} className="text-xs text-[var(--primary)] hover:underline">
                        View →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
