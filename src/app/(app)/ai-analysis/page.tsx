export default function AiAnalysisPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
          Operational Intelligence
        </h1>
        <p className="mt-2 text-[var(--muted)]">Review extraction quality and analysis output after jobs run.</p>
      </div>
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-6 text-sm text-[var(--muted)]">
        <p className="font-semibold text-[var(--text)]">No AI analysis available yet.</p>
        <p className="mt-2">Analysis will appear after extraction jobs run.</p>
      </section>
    </div>
  );
}
