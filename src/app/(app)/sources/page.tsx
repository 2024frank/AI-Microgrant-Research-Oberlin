export default function SourcesPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
            Source Management
          </h1>
          <p className="mt-2 text-[var(--muted)]">Monitor, configure, and synchronize civic data streams.</p>
        </div>
      </div>
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-6 text-sm text-[var(--muted)]">
        <p className="font-semibold text-[var(--text)]">No sources connected yet.</p>
        <p className="mt-2">Add sources later to begin extraction.</p>
      </section>
    </div>
  );
}
