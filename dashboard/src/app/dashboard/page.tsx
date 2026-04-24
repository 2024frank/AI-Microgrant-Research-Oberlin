"use client";

const stats = [
  { label: "Total Events Pushed", value: "93", sub: "from Localist", color: "text-white" },
  { label: "Active Sources", value: "1", sub: "Oberlin Localist", color: "text-white" },
  { label: "Duplicates Flagged", value: "0", sub: "pending AI agent", color: "text-zinc-400" },
  { label: "AI Accuracy", value: "—", sub: "no data yet", color: "text-zinc-400" },
];

const sources = [
  {
    name: "Oberlin Localist",
    url: "calendar.oberlin.edu",
    status: "live",
    pushed: 93,
    lastRun: "Runs every hour via GitHub Actions",
  },
  { name: "FAVA", url: "—", status: "planned", pushed: null, lastRun: "Not yet connected" },
  { name: "AMAM", url: "—", status: "planned", pushed: null, lastRun: "Not yet connected" },
  { name: "City of Oberlin", url: "—", status: "planned", pushed: null, lastRun: "Not yet connected" },
];

export default function OverviewPage() {
  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-white text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Oberlin Community Calendar Unification — AI Micro-Grant Research
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {stats.map((s) => (
          <div key={s.label} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-2">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color} mb-1`}>{s.value}</p>
            <p className="text-zinc-600 text-xs">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Sources */}
      <div>
        <h2 className="text-white text-base font-semibold mb-4">Calendar Sources</h2>
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left text-zinc-500 text-xs font-medium uppercase tracking-wide px-5 py-3">Source</th>
                <th className="text-left text-zinc-500 text-xs font-medium uppercase tracking-wide px-5 py-3">Status</th>
                <th className="text-left text-zinc-500 text-xs font-medium uppercase tracking-wide px-5 py-3">Events Pushed</th>
                <th className="text-left text-zinc-500 text-xs font-medium uppercase tracking-wide px-5 py-3">Sync</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s, i) => (
                <tr key={s.name} className={i !== sources.length - 1 ? "border-b border-white/[0.04]" : ""}>
                  <td className="px-5 py-4">
                    <p className="text-white font-medium">{s.name}</p>
                    <p className="text-zinc-600 text-xs mt-0.5">{s.url}</p>
                  </td>
                  <td className="px-5 py-4">
                    {s.status === "live" ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Live
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-zinc-600 text-xs font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                        Planned
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-zinc-300">
                    {s.pushed !== null ? s.pushed : <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-5 py-4 text-zinc-500 text-xs">{s.lastRun}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* What's next */}
      <div className="mt-8 bg-[#C8102E]/[0.06] border border-[#C8102E]/20 rounded-xl p-5">
        <p className="text-[#C8102E] text-xs font-semibold uppercase tracking-wide mb-2">Up Next</p>
        <p className="text-white text-sm font-medium mb-1">AI Deduplication Agent</p>
        <p className="text-zinc-400 text-sm">
          The AI agent will compare incoming events against the calendar and flag potential duplicates for human review. Flagged events will appear in the Duplicates tab.
        </p>
      </div>
    </div>
  );
}
