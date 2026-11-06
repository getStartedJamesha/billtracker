import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  createCharge,
  recordChargePartialPayment,
  recordPartialPayment,
  toggleChargePaid,
  togglePayment,
} from "@/lib/actions";
import { formatPhoneDashed } from "@/lib/parseBill";
import { normalizePhoneDigits } from "@/lib/phone";
import { currentPeriodLabel, periodLabelToDisplay } from "@/lib/period";
import ReminderButtons from "@/components/ReminderButtons";
import RemindAllBar from "@/components/RemindAllBar";

const personInclude = { phoneAliases: true } as const;

// Names extracted from bills often come through in ALL CAPS (e.g. "IMRAN
// SHAH") - this is just for the greeting line, not stored anywhere.
function toTitleCase(name: string): string {
  return name
    .toLowerCase()
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const showPaid = view === "paid";

  const [pendingPayments, pendingCharges, viewPayments, viewCharges, people, subscriptions] = await Promise.all([
    prisma.payment.findMany({
      where: { paid: false },
      include: { person: { include: personInclude }, billCycle: { include: { subscription: true } } },
    }),
    prisma.charge.findMany({ where: { paid: false }, include: { person: { include: personInclude } } }),
    showPaid
      ? prisma.payment.findMany({
          where: { paid: true },
          include: { person: { include: personInclude }, billCycle: { include: { subscription: true } } },
        })
      : Promise.resolve(null),
    showPaid
      ? prisma.charge.findMany({ where: { paid: true }, include: { person: { include: personInclude } } })
      : Promise.resolve(null),
    prisma.person.findMany({ orderBy: { name: "asc" } }),
    prisma.subscription.findMany({ include: { cycles: { where: { periodLabel: currentPeriodLabel() } } } }),
  ]);

  const missingThisMonth = subscriptions.filter((s) => s.cycles.length === 0);
  const totalPending =
    pendingPayments.reduce((sum, p) => sum + (p.amountOwed - p.amountPaid), 0) +
    pendingCharges.reduce((sum, c) => sum + (c.amount - c.amountPaid), 0);
  const pendingCount = pendingPayments.length + pendingCharges.length;
  const pendingPeopleIds = new Set([...pendingPayments.map((p) => p.personId), ...pendingCharges.map((c) => c.personId)]);
  const today = new Date();

  type Row =
    | {
        kind: "payment";
        id: string;
        personId: string;
        person: (typeof pendingPayments)[number]["person"];
        amount: number;
        amountPaid: number;
        paymentNote: string | null;
        paid: boolean;
        subscriptionId: string;
        subscriptionName: string;
        periodLabel: string;
        dueDate: Date | null;
      }
    | {
        kind: "charge";
        id: string;
        personId: string;
        person: (typeof pendingCharges)[number]["person"];
        amount: number;
        amountPaid: number;
        paymentNote: string | null;
        paid: boolean;
        description: string;
        createdAt: Date;
      };

  function remainingOf(row: Row): number {
    return Math.max(row.amount - row.amountPaid, 0);
  }

  function buildReminderMessage(personName: string, personRows: Row[]): string {
    const total = personRows.reduce((s, r) => s + remainingOf(r), 0);
    const lines = personRows.map((r) =>
      r.kind === "payment"
        ? `- ${r.subscriptionName} (${periodLabelToDisplay(r.periodLabel)}): $${remainingOf(r).toFixed(2)}`
        : `- ${r.description}: $${remainingOf(r).toFixed(2)}`
    );
    const greetingName = toTitleCase(personName);
    return `Assalaamu alaikum Wa Rahmathullahi Wa Barakathahu ${greetingName}, friendly reminder that you owe $${total.toFixed(
      2
    )} total:\n\n${lines.join("\n")}\n\n‏جزاك الله خيرا`;
  }

  const paymentsToShow = showPaid ? viewPayments! : pendingPayments;
  const chargesToShow = showPaid ? viewCharges! : pendingCharges;

  const rows: Row[] = [
    ...paymentsToShow.map(
      (p): Row => ({
        kind: "payment",
        id: p.id,
        personId: p.personId,
        person: p.person,
        amount: p.amountOwed,
        amountPaid: p.amountPaid,
        paymentNote: p.paymentNote,
        paid: p.paid,
        subscriptionId: p.billCycle.subscriptionId,
        subscriptionName: p.billCycle.subscription.name,
        periodLabel: p.billCycle.periodLabel,
        dueDate: p.billCycle.dueDate,
      })
    ),
    ...chargesToShow.map(
      (c): Row => ({
        kind: "charge",
        id: c.id,
        personId: c.personId,
        person: c.person,
        amount: c.amount,
        amountPaid: c.amountPaid,
        paymentNote: c.paymentNote,
        paid: c.paid,
        description: c.description,
        createdAt: c.createdAt,
      })
    ),
  ];

  const byPerson = new Map<string, Row[]>();
  for (const row of rows) {
    const list = byPerson.get(row.personId) ?? [];
    list.push(row);
    byPerson.set(row.personId, list);
  }

  const remindAllEntries = showPaid
    ? []
    : Array.from(byPerson.entries()).flatMap(([, personRows]) => {
        const person = personRows[0].person;
        if (!person.phone || normalizePhoneDigits(person.phone).length !== 10) return [];
        return [
          {
            personId: person.id,
            name: person.name,
            phone: person.phone,
            total: personRows.reduce((s, r) => s + remainingOf(r), 0),
            message: buildReminderMessage(person.name, personRows),
          },
        ];
      });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500">Everyone who still owes money, at a glance.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Total pending" value={`$${totalPending.toFixed(2)}`} accent="text-amber-600" />
        <SummaryCard label="Unpaid shares" value={String(pendingCount)} accent="text-brand-600" />
        <SummaryCard label="People with balances" value={String(pendingPeopleIds.size)} accent="text-slate-700" />
      </div>

      {missingThisMonth.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="font-medium text-amber-900">
            {missingThisMonth.length} subscription{missingThisMonth.length > 1 ? "s" : ""} haven&apos;t had a bill
            generated for {periodLabelToDisplay(currentPeriodLabel())} yet.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {missingThisMonth.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/subscriptions/${s.id}`}
                  className="inline-block rounded-md bg-white px-3 py-1 text-sm font-medium text-amber-800 shadow-sm ring-1 ring-amber-300 hover:bg-amber-100"
                >
                  {s.name} →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Add a one-off charge</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          For a one-time cost that doesn&apos;t need a whole subscription — e.g. &quot;Sam owes $20 for dinner.&quot;
        </p>
        <form action={createCharge} className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">Who</label>
            <select name="personId" required className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">Choose person…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-slate-700">What for</label>
            <input
              name="description"
              required
              placeholder="Dinner on Friday"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Amount ($)</label>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="20.00"
              className="mt-1 w-28 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Add charge
          </button>
        </form>
      </div>

      {!showPaid && remindAllEntries.length > 0 && (
        <div>
          <RemindAllBar entries={remindAllEntries} />
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">{showPaid ? "Paid" : "Pending transfers"}</h2>
          <div className="flex gap-1 rounded-md bg-slate-100 p-1 text-sm">
            <Link
              href="/"
              className={`rounded px-3 py-1 font-medium ${!showPaid ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
            >
              Pending
            </Link>
            <Link
              href="/?view=paid"
              className={`rounded px-3 py-1 font-medium ${showPaid ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
            >
              Paid
            </Link>
          </div>
        </div>
        {byPerson.size === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-500">
            {showPaid ? "No paid history yet." : "Nobody owes anything right now. 🎉"}
          </p>
        ) : (
          <div className="space-y-4">
            {Array.from(byPerson.entries()).map(([personId, personRows]) => {
              const person = personRows[0].person;
              const subtotal = personRows.reduce((s, r) => s + (showPaid ? r.amount : remainingOf(r)), 0);
              return (
                <div key={personId} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{person.name}</p>
                      {(person.phone || person.phoneAliases.length > 0) && (
                        <p className="text-sm text-slate-500">
                          {[person.phone, ...person.phoneAliases.map((a) => formatPhoneDashed(a.phone))]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      {person.note && <p className="text-xs text-slate-400">{person.note}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      {!showPaid && person.phone && (
                        <ReminderButtons phone={person.phone} message={buildReminderMessage(person.name, personRows)} />
                      )}
                      <p className={`text-lg font-bold ${showPaid ? "text-green-600" : "text-amber-600"}`}>
                        ${subtotal.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {personRows.map((row) => {
                      if (row.kind === "payment") {
                        const overdue = !showPaid && row.dueDate && new Date(row.dueDate) < today;
                        const partial = !showPaid && row.amountPaid > 0;
                        const remaining = row.amount - row.amountPaid;
                        return (
                          <li key={`payment-${row.id}`} className="py-1">
                            <div className="flex flex-wrap items-center gap-2 px-1 pt-1 text-xs">
                              <Link
                                href={`/subscriptions/${row.subscriptionId}`}
                                className="font-medium text-slate-500 hover:underline"
                              >
                                {row.subscriptionName}
                              </Link>
                              <span className="text-slate-400">{periodLabelToDisplay(row.periodLabel)}</span>
                              {overdue && (
                                <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700">overdue</span>
                              )}
                            </div>
                            <form action={togglePayment.bind(null, row.subscriptionId, row.id)}>
                              <button
                                type="submit"
                                title={showPaid ? "Tap to undo" : "Tap to mark paid"}
                                className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm transition active:scale-[0.99] ${
                                  showPaid ? "hover:bg-slate-50" : "hover:bg-green-50"
                                }`}
                              >
                                <span className="flex items-center gap-2">
                                  <span
                                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                                      showPaid
                                        ? "border-green-500 bg-green-500 text-white"
                                        : partial
                                          ? "border-amber-500 bg-amber-100 text-amber-600"
                                          : "border-slate-300 text-transparent"
                                    }`}
                                  >
                                    {showPaid ? "✓" : partial ? "½" : "✓"}
                                  </span>
                                  <span className="text-slate-500">{showPaid ? "Paid" : "Mark paid"}</span>
                                </span>
                                <span className="font-semibold text-slate-800">${row.amount.toFixed(2)}</span>
                              </button>
                            </form>
                            {partial && (
                              <p className="px-2 pb-1 text-xs text-amber-700">
                                Partially paid: ${row.amountPaid.toFixed(2)} of ${row.amount.toFixed(2)} ($
                                {remaining.toFixed(2)} remaining)
                                {row.paymentNote && ` — ${row.paymentNote}`}
                              </p>
                            )}
                            {!partial && row.paymentNote && (
                              <p className="px-2 pb-1 text-xs text-slate-400">{row.paymentNote}</p>
                            )}
                            {!showPaid && (
                              <details className="px-2 pb-1">
                                <summary className="cursor-pointer text-xs text-brand-600 hover:underline">
                                  Record a payment
                                </summary>
                                <form
                                  action={recordPartialPayment.bind(null, row.subscriptionId, row.id)}
                                  className="mt-1 flex flex-wrap items-center gap-2 pb-1"
                                >
                                  <input
                                    name="amountPaid"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    defaultValue={row.amountPaid || ""}
                                    placeholder="Amount paid so far"
                                    className="w-32 rounded-md border border-slate-300 px-2 py-1 text-sm"
                                  />
                                  <input
                                    name="paymentNote"
                                    defaultValue={row.paymentNote ?? ""}
                                    placeholder="Note (e.g. paid via Zelle)"
                                    className="min-w-[160px] flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                                  />
                                  <button className="text-xs font-medium text-brand-600 hover:underline">Save</button>
                                </form>
                              </details>
                            )}
                          </li>
                        );
                      }

                      const partial = !showPaid && row.amountPaid > 0;
                      const remaining = row.amount - row.amountPaid;
                      return (
                        <li key={`charge-${row.id}`} className="py-1">
                          <div className="flex flex-wrap items-center gap-2 px-1 pt-1 text-xs">
                            <span className="font-medium text-slate-500">{row.description}</span>
                            <span className="text-slate-400">one-off</span>
                          </div>
                          <form action={toggleChargePaid.bind(null, row.id)}>
                            <button
                              type="submit"
                              title={showPaid ? "Tap to undo" : "Tap to mark paid"}
                              className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm transition active:scale-[0.99] ${
                                showPaid ? "hover:bg-slate-50" : "hover:bg-green-50"
                              }`}
                            >
                              <span className="flex items-center gap-2">
                                <span
                                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                                    showPaid
                                      ? "border-green-500 bg-green-500 text-white"
                                      : partial
                                        ? "border-amber-500 bg-amber-100 text-amber-600"
                                        : "border-slate-300 text-transparent"
                                  }`}
                                >
                                  {showPaid ? "✓" : partial ? "½" : "✓"}
                                </span>
                                <span className="text-slate-500">{showPaid ? "Paid" : "Mark paid"}</span>
                              </span>
                              <span className="font-semibold text-slate-800">${row.amount.toFixed(2)}</span>
                            </button>
                          </form>
                          {partial && (
                            <p className="px-2 pb-1 text-xs text-amber-700">
                              Partially paid: ${row.amountPaid.toFixed(2)} of ${row.amount.toFixed(2)} ($
                              {remaining.toFixed(2)} remaining)
                              {row.paymentNote && ` — ${row.paymentNote}`}
                            </p>
                          )}
                          {!partial && row.paymentNote && (
                            <p className="px-2 pb-1 text-xs text-slate-400">{row.paymentNote}</p>
                          )}
                          {!showPaid && (
                            <details className="px-2 pb-1">
                              <summary className="cursor-pointer text-xs text-brand-600 hover:underline">
                                Record a payment
                              </summary>
                              <form
                                action={recordChargePartialPayment.bind(null, row.id)}
                                className="mt-1 flex flex-wrap items-center gap-2 pb-1"
                              >
                                <input
                                  name="amountPaid"
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  defaultValue={row.amountPaid || ""}
                                  placeholder="Amount paid so far"
                                  className="w-32 rounded-md border border-slate-300 px-2 py-1 text-sm"
                                />
                                <input
                                  name="paymentNote"
                                  defaultValue={row.paymentNote ?? ""}
                                  placeholder="Note (e.g. paid via Zelle)"
                                  className="min-w-[160px] flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                                />
                                <button className="text-xs font-medium text-brand-600 hover:underline">Save</button>
                              </form>
                            </details>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent}`}>{value}</p>
    </div>
  );
}
