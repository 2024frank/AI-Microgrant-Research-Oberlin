import { MapPinned } from "lucide-react";

export default function GeoIntelPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
          Geographic Intelligence
        </h1>
        <p className="mt-2 text-[var(--muted)]">Validate locations, coverage, and neighborhood distribution.</p>
      </div>
      <section className="flex min-h-[320px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-6">
        <div className="text-center">
          <MapPinned aria-hidden="true" className="mx-auto text-[#6bd8cb]" size={46} />
          <p className="mt-3 font-[var(--font-public-sans)] text-xl font-semibold text-[var(--text)]">
            No geographic classifications yet.
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Geographic relevance data will appear after posts are analyzed.
          </p>
        </div>
      </section>
    </div>
  );
}
