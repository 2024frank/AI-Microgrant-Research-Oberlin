import type { PostType } from "@/data/mockPosts";
import { cn } from "@/lib/utils";

const typeStyles: Record<PostType, string> = {
  event: "border-[var(--primary)] bg-[var(--primary-soft)] text-[#ffdad9]",
  announcement: "border-[#6bd8cb]/70 bg-[#6bd8cb]/10 text-[#bdf3ec]",
};

type PostTypeBadgeProps = {
  type: PostType;
  className?: string;
};

export function PostTypeBadge({ type, className }: PostTypeBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em]",
        typeStyles[type],
        className,
      )}
    >
      {type}
    </span>
  );
}
