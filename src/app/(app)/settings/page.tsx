export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
          Settings
        </h1>
        <p className="mt-2 text-[var(--muted)]">Configuration controls will appear as platform services are connected.</p>
      </div>
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-6 text-sm text-[var(--muted)]">
        No configurable platform settings are available yet.
      </section>
    </div>
  );
}
