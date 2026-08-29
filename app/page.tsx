import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { togglePayment } from "@/lib/actions";
import { currentPeriodLabel, periodLabelToDisplay } from "@/lib/period";

export default async function DashboardPage() {
  const pendingPayments = await prisma.payment.findMany({
    where: { paid: false },
    include: { person: true, billCycle: { include: { subscription: true } } },
    orderBy: [{ billCycle: { dueDate: "asc" } }],
  });

  const subscriptions = await prisma.subscription.findMany({
    include: { cycles: { where: { periodLabel: currentPeriodLabel() } } },
  });
  const missingThisMonth = subscriptions.filter((s) => s.cycles.length === 0);

  const totalPending = pendingPayments.reduce((sum, p) => sum + p.amountOwed, 0);
  const today = new Date();

  const byPerson = new Map<string, typeof pendingPayments>();
  for (const p of pendingPayments) {
    const list = byPerson.get(p.personId) ?? [];
    list.push(p);
    byPerson.set(p.personId, list);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500">Everyone who still owes money, at a glance.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Total pending" value={`$${totalPending.toFixed(2)}`} accent="text-amber-600" />
        <SummaryCard label="Unpaid shares" value={String(pendingPayments.length)} accent="text-brand-600" />
        <SummaryCard label="People with balances" value={String(byPerson.size)} accent="text-slate-700" />
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

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Pending transfers</h2>
        {byPerson.size === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-500">
            Nobody owes anything right now. 🎉
          </p>
        ) : (
          <div className="space-y-4">
            {Array.from(byPerson.entries()).map(([personId, payments]) => {
              const person = payments[0].person;
              const subtotal = payments.reduce((s, p) => s + p.amountOwed, 0);
              return (
                <div key={personId} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{person.name}</p>
                      {person.phone && <p className="text-sm text-slate-500">{person.phone}</p>}
                    </div>
                    <p className="text-lg font-bold text-amber-600">${subtotal.toFixed(2)}</p>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {payments.map((p) => {
                      const overdue = p.billCycle.dueDate && new Date(p.billCycle.dueDate) < today;
                      return (
                        <li key={p.id} className="py-1">
                          <div className="flex flex-wrap items-center gap-2 px-1 pt-1 text-xs">
                            <Link
                              href={`/subscriptions/${p.billCycle.subscriptionId}`}
                              className="font-medium text-slate-500 hover:underline"
                            >
                              {p.billCycle.subscription.name}
                            </Link>
                            <span className="text-slate-400">{periodLabelToDisplay(p.billCycle.periodLabel)}</span>
                            {overdue && (
                              <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700">overdue</span>
                            )}
                          </div>
                          <form action={togglePayment.bind(null, p.billCycle.subscriptionId, p.id)}>
                            <button
                              type="submit"
                              title="Tap to mark paid"
                              className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm transition hover:bg-green-50 active:scale-[0.99]"
                            >
                              <span className="flex items-center gap-2">
                                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 border-slate-300 text-xs font-bold text-transparent">
                                  ✓
                                </span>
                                <span className="text-slate-500">Mark paid</span>
                              </span>
                              <span className="font-semibold text-slate-800">${p.amountOwed.toFixed(2)}</span>
                            </button>
                          </form>
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
