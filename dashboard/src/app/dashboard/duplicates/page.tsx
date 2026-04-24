"use client";

export default function DuplicatesPage() {
  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-white text-2xl font-bold tracking-tight">Duplicates</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Events flagged by the AI agent as potential duplicates. Review each one and confirm or reject.
        </p>
      </div>

      {/* Score card */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-2">Pending Review</p>
          <p className="text-3xl font-bold text-white mb-1">0</p>
          <p className="text-zinc-600 text-xs">events in queue</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-2">AI Accuracy</p>
          <p className="text-3xl font-bold text-zinc-400 mb-1">—</p>
          <p className="text-zinc-600 text-xs">no reviews yet</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-2">Total Reviewed</p>
          <p className="text-3xl font-bold text-white mb-1">0</p>
          <p className="text-zinc-600 text-xs">confirmed + rejected</p>
        </div>
      </div>

      {/* Empty state */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl flex flex-col items-center justify-center py-20 text-center px-6">
        <div className="w-12 h-12 rounded-full bg-white/[0.05] flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
          </svg>
        </div>
        <p className="text-white font-medium mb-2">No duplicates in queue</p>
        <p className="text-zinc-500 text-sm max-w-sm">
          Once the AI deduplication agent is active, events it flags as potential duplicates will appear here for your review.
        </p>

        <div className="mt-8 text-left bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 max-w-md w-full">
          <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wide mb-3">How it will work</p>
          <ol className="space-y-2.5 text-sm text-zinc-400">
            <li className="flex gap-2.5">
              <span className="text-[#C8102E] font-bold shrink-0">1.</span>
              AI agent compares each incoming event against the calendar
            </li>
            <li className="flex gap-2.5">
              <span className="text-[#C8102E] font-bold shrink-0">2.</span>
              If it thinks it is a duplicate, the event lands here instead of being posted
            </li>
            <li className="flex gap-2.5">
              <span className="text-[#C8102E] font-bold shrink-0">3.</span>
              You see both events side by side and decide: confirm or reject
            </li>
            <li className="flex gap-2.5">
              <span className="text-[#C8102E] font-bold shrink-0">4.</span>
              Each decision grades the AI — building an accuracy score over time
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
