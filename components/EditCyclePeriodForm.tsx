"use client";

import { useState } from "react";
import { updateCyclePeriod } from "@/lib/actions";

export default function EditCyclePeriodForm({
  subscriptionId,
  cycleId,
  currentPeriodLabel,
  otherPeriodLabels,
}: {
  subscriptionId: string;
  cycleId: string;
  currentPeriodLabel: string;
  otherPeriodLabels: string[];
}) {
  const [error, setError] = useState<string | null>(null);
  const others = new Set(otherPeriodLabels);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const periodLabel = String(new FormData(e.currentTarget).get("periodLabel") || "").trim();
    if (!/^\d{4}-\d{2}$/.test(periodLabel)) {
      e.preventDefault();
      setError("Enter the month as YYYY-MM, e.g. 2026-07.");
      return;
    }
    if (others.has(periodLabel)) {
      e.preventDefault();
      setError(`A bill for ${periodLabel} already exists - merge or delete one first.`);
      return;
    }
    setError(null);
  }

  return (
    <details className="mt-0.5">
      <summary className="cursor-pointer text-xs text-brand-600 hover:underline">Edit month</summary>
      <form
        action={updateCyclePeriod.bind(null, subscriptionId, cycleId)}
        onSubmit={handleSubmit}
        className="mt-1 flex flex-wrap items-center gap-2"
      >
        <input
          name="periodLabel"
          defaultValue={currentPeriodLabel}
          pattern="\d{4}-\d{2}"
          className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
        <button className="text-xs font-medium text-brand-600 hover:underline">Save</button>
        {error && <span className="w-full text-xs font-medium text-red-600">{error}</span>}
      </form>
    </details>
  );
}
