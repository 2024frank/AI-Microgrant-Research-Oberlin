export default function SystemHealthPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
          System Health
        </h1>
        <p className="mt-2 text-[var(--muted)]">Service and pipeline status will appear as systems are connected.</p>
      </div>
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-6 text-sm text-[var(--muted)]">
        <p className="font-semibold text-[var(--text)]">No pipeline activity yet.</p>
        <p className="mt-2">System metrics will appear after services are connected.</p>
      </section>
    </div>
  );
}
