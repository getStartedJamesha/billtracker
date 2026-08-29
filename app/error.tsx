"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-lg border border-red-200 bg-red-50 p-6 text-center">
      <p className="font-medium text-red-900">{error.message || "Something went wrong."}</p>
      <button
        onClick={reset}
        className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
      >
        Try again
      </button>
    </div>
  );
}
