import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { PostTypeBadge } from "@/components/PostTypeBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { getCommunityHubPostTypeLabel } from "@/lib/postTypes";

type CivicPost = {
  id: string;
  title: string;
  type: "event" | "announcement";
  postTypeId?: number[];
  status: "pending" | "approved" | "flagged" | "duplicate" | "archived";
  confidence: number;
  duplicateScore: number;
  description: string;
};

type ReviewCardProps = {
  post: CivicPost;
};

export function ReviewCard({ post }: ReviewCardProps) {
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <PostTypeBadge type={post.type} />
        <StatusBadge status={post.status} />
      </div>
      {post.postTypeId && post.postTypeId.length > 0 && (
        <p className="mt-1.5 text-xs text-[var(--muted)]">
          {getCommunityHubPostTypeLabel(post.postTypeId)}
        </p>
      )}
      <h3 className="mt-3 font-[var(--font-public-sans)] text-lg font-semibold text-[var(--text)]">
        {post.title}
      </h3>
      <p className="mt-2 line-clamp-2 text-sm text-[var(--muted)]">{post.description}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="font-[var(--font-plex)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)]">
            Confidence
          </p>
          <p className="text-[var(--text)]">{post.confidence}%</p>
        </div>
        <div>
          <p className="font-[var(--font-plex)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)]">
            Duplicate
          </p>
          <p className="text-[var(--text)]">{post.duplicateScore}%</p>
        </div>
      </div>
      <Link
        className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#ffb3b3] hover:text-[#ffdad9]"
        href={`/posts/${post.id}`}
      >
        Review record <ArrowRight aria-hidden="true" size={16} />
      </Link>
    </article>
  );
}
