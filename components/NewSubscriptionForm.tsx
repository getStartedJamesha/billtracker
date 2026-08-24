"use client";

import { useRef, useState } from "react";
import { createSubscription } from "@/lib/actions";

type PersonOption = { id: string; name: string; phone: string | null };
type NewMemberRow = { name: string; phone: string };

export default function NewSubscriptionForm({ people }: { people: PersonOption[] }) {
  const [splitType, setSplitType] = useState("equal");
  const [newMembers, setNewMembers] = useState<NewMemberRow[]>([]);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  function addRow() {
    setNewMembers((rows) => [...rows, { name: "", phone: "" }]);
  }

  function updateRow(index: number, field: keyof NewMemberRow, value: string) {
    setNewMembers((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function removeRow(index: number) {
    setNewMembers((rows) => rows.filter((_, i) => i !== index));
  }

  function handleSubmit() {
    if (hiddenInputRef.current) {
      hiddenInputRef.current.value = JSON.stringify(newMembers.filter((r) => r.name.trim()));
    }
  }

  return (
    <form action={createSubscription} onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">Subscription name</label>
          <input
            name="name"
            required
            placeholder="YouTube Premium"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Monthly amount ($)</label>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="22.99"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Split method</label>
          <select
            name="splitType"
            value={splitType}
            onChange={(e) => setSplitType(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          >
            <option value="equal">Split equally</option>
            <option value="custom">Custom share per person</option>
          </select>
          {splitType === "custom" && (
            <p className="mt-1 text-xs text-slate-500">
              You&apos;ll set each person&apos;s exact share after adding them below.
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Due day of month (optional)</label>
          <input
            name="dueDay"
            type="number"
            min="1"
            max="31"
            placeholder="15"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700">Description (optional)</label>
          <input
            name="description"
            placeholder="Family plan shared with the group chat"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700">Include existing people</p>
        {people.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">No people yet — add some below or on the People page.</p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {people.map((p) => (
              <label key={p.id} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                <input type="checkbox" name="personIds" value={p.id} className="h-4 w-4 rounded border-slate-300" />
                <span className="font-medium text-slate-800">{p.name}</span>
                {p.phone && <span className="text-slate-400">({p.phone})</span>}
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">Add new people to this group</p>
          <button type="button" onClick={addRow} className="text-sm font-medium text-brand-600 hover:underline">
            + Add person
          </button>
        </div>
        {newMembers.length > 0 && (
          <div className="mt-2 space-y-2">
            {newMembers.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  placeholder="Name"
                  value={row.name}
                  onChange={(e) => updateRow(i, "name", e.target.value)}
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
                <input
                  placeholder="Phone number"
                  value={row.phone}
                  onChange={(e) => updateRow(i, "phone", e.target.value)}
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="rounded-md px-2 py-2 text-sm text-red-600 hover:bg-red-50"
                  aria-label="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <input ref={hiddenInputRef} type="hidden" name="newMembersJson" defaultValue="[]" />
      </div>

      <button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
        Create subscription
      </button>
    </form>
  );
}
