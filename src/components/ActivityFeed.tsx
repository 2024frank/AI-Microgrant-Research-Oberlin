export type ActivityItem = {
  id: string;
  actor: string;
  action: string;
  target: string;
  time: string;
  severity: "info" | "success" | "warning" | "danger";
};
import { cn } from "@/lib/utils";

const dotStyles = {
  info: "bg-blue-300",
  success: "bg-teal-300",
  warning: "bg-amber-300",
  danger: "bg-red-300",
};

type ActivityFeedProps = {
  items: ActivityItem[];
  emptyText?: string;
};

export function ActivityFeed({ items, emptyText = "No activity logs yet." }: ActivityFeedProps) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="font-[var(--font-public-sans)] text-lg font-semibold text-[var(--text)]">
          Activity Feed
        </h2>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[var(--muted)]">{emptyText}</p>
      ) : (
        <ol className="divide-y divide-[var(--border)]">
          {items.map((item) => (
            <li key={item.id} className="flex gap-3 px-4 py-3">
              <span
                aria-hidden="true"
                className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", dotStyles[item.severity])}
              />
              <div className="min-w-0">
                <p className="text-sm text-[var(--text)]">
                  <span className="font-semibold">{item.actor}</span> {item.action}{" "}
                  <span className="text-[#ffb3b3]">{item.target}</span>
                </p>
                <p className="mt-1 font-[var(--font-plex)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)]">
                  {item.time}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
