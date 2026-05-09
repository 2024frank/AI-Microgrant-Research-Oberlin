import { Database } from "lucide-react";

import type { CivicSource } from "@/data/mockSources";
import { StatusBadge } from "@/components/StatusBadge";

type SourceHealthCardProps = {
  source: CivicSource;
};

export function SourceHealthCard({ source }: SourceHealthCardProps) {
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-[var(--font-public-sans)] text-base font-semibold text-[var(--text)]">
            {source.name}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">{source.coverage}</p>
        </div>
        <Database aria-hidden="true" className="text-[#6bd8cb]" size={20} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={source.status} />
        <span className="rounded border border-[var(--border)] px-2 py-0.5 font-[var(--font-plex)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)]">
          {source.type}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-[var(--muted)]">Synced</dt>
          <dd className="font-semibold text-[var(--text)]">{source.postsSynced}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Errors</dt>
          <dd className="font-semibold text-[var(--text)]">{source.errorRate}%</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Last</dt>
          <dd className="font-semibold text-[var(--text)]">{source.lastSync}</dd>
        </div>
      </dl>
    </article>
  );
}
