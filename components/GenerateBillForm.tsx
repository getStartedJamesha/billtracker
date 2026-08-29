"use client";

import { useState } from "react";
import { generateCycle } from "@/lib/actions";

export default function GenerateBillForm({
  subscriptionId,
  suggestedPeriodLabel,
  defaultAmount,
  existingPeriodLabels,
  hasNoMembers,
}: {
  subscriptionId: string;
  suggestedPeriodLabel: string;
  defaultAmount: number;
  existingPeriodLabels: string[];
  hasNoMembers: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const existing = new Set(existingPeriodLabels);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const periodLabel = String(new FormData(e.currentTarget).get("periodLabel") || "").trim();
    if (!/^\d{4}-\d{2}$/.test(periodLabel)) {
      e.preventDefault();
      setError("Enter the month as YYYY-MM, e.g. 2026-09.");
      return;
    }
    if (existing.has(periodLabel)) {
      e.preventDefault();
      setError(`A bill for ${periodLabel} already exists below - edit that one instead.`);
      return;
    }
    setError(null);
  }

  return (
    <form
      action={generateCycle.bind(null, subscriptionId)}
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div>
        <label className="block text-xs font-medium text-slate-700">Month (YYYY-MM)</label>
        <input
          name="periodLabel"
          defaultValue={suggestedPeriodLabel}
          pattern="\d{4}-\d{2}"
          className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">Total amount ($)</label>
        <input
          name="totalAmount"
          type="number"
          step="0.01"
          min="0.01"
          defaultValue={defaultAmount}
          className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
        Generate bill
      </button>
      {hasNoMembers && (
        <p className="text-xs text-slate-500">
          No members yet — that&apos;s fine. Generate the bill, then upload the PDF below and people
          will be added automatically from it.
        </p>
      )}
      {error && <p className="w-full text-sm font-medium text-red-600">{error}</p>}
    </form>
  );
}
