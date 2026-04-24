"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="min-h-screen bg-[#0f1117] flex items-center justify-center px-4">
        <div className="text-center">
          <h2 className="text-white text-xl font-semibold mb-3">Something went wrong</h2>
          <button
            onClick={reset}
            className="bg-[#C8102E] hover:bg-[#a50d26] text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
