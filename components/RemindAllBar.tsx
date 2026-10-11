"use client";

import { useState } from "react";
import ReminderButtons from "./ReminderButtons";

export interface RemindAllEntry {
  personId: string;
  name: string;
  phone: string;
  total: number;
  message: string;
}

// Neither SMS nor WhatsApp lets a webpage send on someone's behalf - that's
// deliberate, to stop pages from spamming people. So "remind everyone at
// once" can't really fire N messages from one tap; this instead steps
// through each person one at a time so sending to everyone is still just a
// quick tap-tap-tap instead of hunting through the list for each person.
export default function RemindAllBar({ entries }: { entries: RemindAllEntry[] }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  if (entries.length === 0) return null;

  if (!open) {
    return (
      <button
        onClick={() => {
          setIndex(0);
          setOpen(true);
        }}
        className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        📣 Remind everyone ({entries.length})
      </button>
    );
  }

  const current = entries[index];
  const isLast = index === entries.length - 1;

  return (
    <div className="w-full rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">
          Reminder {index + 1} of {entries.length}
        </p>
        <button
          onClick={() => setOpen(false)}
          className="text-xs font-medium text-slate-400 hover:text-slate-600"
        >
          Close
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">{current.name}</p>
          <p className="text-sm text-amber-600">${current.total.toFixed(2)} total</p>
        </div>
        <ReminderButtons phone={current.phone} message={current.message} />
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Tap 💬 or 🟢 above, send it in the app that opens, then come back and tap Next.
      </p>
      <div className="mt-3 flex justify-end gap-2">
        {!isLast ? (
          <button
            onClick={() => setIndex((i) => i + 1)}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Next person →
          </button>
        ) : (
          <button
            onClick={() => setOpen(false)}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}
