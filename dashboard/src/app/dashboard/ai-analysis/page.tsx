"use client";

const mockRows = [
  { event: "Spring Concert", source: "Localist", match: "FAVA Calendar", confidence: "94%", status: "Duplicate" },
  { event: "Art Exhibition Opening", source: "AMAM", match: "Localist", confidence: "87%", status: "Duplicate" },
  { event: "Faculty Lecture Series", source: "Localist", match: "City Calendar", confidence: "61%", status: "Review" },
];

export default function AIAnalysisPage() {
  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold tracking-tight">AI Analysis</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Duplicate detection results from the AI agent across all calendar sources.
          </p>
        </div>
        <span className="text-xs font-medium text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-3 py-1">
          Coming Soon
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Events Analyzed", value: "—", sub: "AI agent not yet active" },
          { label: "Duplicates Caught", value: "—", sub: "across all sources" },
          { label: "AI Accuracy", value: "—", sub: "based on human reviews" },
        ].map((s) => (
          <div key={s.label} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5 opacity-50">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-2">{s.label}</p>
            <p className="text-3xl font-bold text-white mb-1">{s.value}</p>
            <p className="text-zinc-600 text-xs">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Preview table */}
      <div className="relative">
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden opacity-40 pointer-events-none select-none">
          <div className="grid grid-cols-5 gap-4 px-5 py-3 border-b border-white/[0.06]">
            {["Event", "Source", "Matched To", "Confidence", "Status"].map((h) => (
              <p key={h} className="text-zinc-500 text-xs font-medium uppercase tracking-wide">{h}</p>
            ))}
          </div>
          {mockRows.map((row, i) => (
            <div key={i} className={`grid grid-cols-5 gap-4 px-5 py-4 ${i !== mockRows.length - 1 ? "border-b border-white/[0.04]" : ""}`}>
              <p className="text-white text-sm">{row.event}</p>
              <p className="text-zinc-400 text-sm">{row.source}</p>
              <p className="text-zinc-400 text-sm">{row.match}</p>
              <p className="text-zinc-300 text-sm font-medium">{row.confidence}</p>
              <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full w-fit ${
                row.status === "Duplicate"
                  ? "bg-red-400/10 text-red-400 border border-red-400/20"
                  : "bg-amber-400/10 text-amber-400 border border-amber-400/20"
              }`}>
                {row.status}
              </span>
            </div>
          ))}
        </div>

        {/* Overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-[#0f0606]/90 border border-white/[0.08] rounded-2xl px-8 py-6 text-center backdrop-blur-sm">
            <div className="w-10 h-10 rounded-full bg-amber-400/10 flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
            </div>
            <p className="text-white font-semibold mb-1">AI Agent Coming Soon</p>
            <p className="text-zinc-500 text-sm max-w-xs">
              Once the Gemini API key is configured, the agent will start analyzing events and populating this table.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
