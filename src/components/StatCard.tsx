import type { LucideIcon } from "lucide-react";

type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: "default" | "danger" | "teal";
};

const toneStyles = {
  default: "text-[#ffdad9]",
  danger: "text-[#ffb4ab]",
  teal: "text-[#89f5e7]",
};

export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "default",
}: StatCardProps) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
            {label}
          </p>
          <p className="mt-2 font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
            {value}
          </p>
        </div>
        <Icon aria-hidden="true" className={toneStyles[tone]} size={22} />
      </div>
      <p className="mt-3 text-sm text-[var(--muted)]">{detail}</p>
    </section>
  );
}
