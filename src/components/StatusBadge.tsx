import { cn } from "@/lib/utils";

const statusStyles = {
  pending: "border-amber-300/70 bg-amber-300/10 text-amber-100",
  approved: "border-teal-300/70 bg-teal-300/10 text-teal-100",
  denied: "border-red-300/70 bg-red-300/10 text-red-100",
  rejected: "border-red-300/70 bg-red-300/10 text-red-100",
  flagged: "border-red-300/70 bg-red-300/10 text-red-100",
  duplicate: "border-orange-300/70 bg-orange-300/10 text-orange-100",
  archived: "border-slate-400/50 bg-slate-400/10 text-slate-200",
  healthy: "border-teal-300/70 bg-teal-300/10 text-teal-100",
  warning: "border-amber-300/70 bg-amber-300/10 text-amber-100",
  paused: "border-slate-400/50 bg-slate-400/10 text-slate-200",
  error: "border-red-300/70 bg-red-300/10 text-red-100",
  active: "border-teal-300/70 bg-teal-300/10 text-teal-100",
  invited: "border-blue-300/70 bg-blue-300/10 text-blue-100",
  disabled: "border-red-300/70 bg-red-300/10 text-red-100",
  suspended: "border-red-300/70 bg-red-300/10 text-red-100",
};

type StatusBadgeProps = {
  status: keyof typeof statusStyles;
  className?: string;
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em]",
        statusStyles[status],
        className,
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}
