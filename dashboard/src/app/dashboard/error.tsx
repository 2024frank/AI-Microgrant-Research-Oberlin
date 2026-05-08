"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#0f0000] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-xl bg-white/[0.04] border border-white/[0.1] rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-2">Dashboard failed to load</h2>
        <p className="text-zinc-400 text-sm mb-4">
          A runtime error occurred in the dashboard area. Try reloading this section.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => reset()}
            className="bg-[#C8102E] hover:bg-[#a50d26] text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            Retry dashboard
          </button>
          <a
            href="/dashboard"
            className="text-zinc-300 hover:text-white border border-white/[0.12] text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            Go to overview
          </a>
        </div>
        <p className="text-zinc-600 text-xs mt-4 break-words">
          {error?.message || "Unknown dashboard error"}
        </p>
      </div>
    </div>
  );
}
