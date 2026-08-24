import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function SubscriptionsPage() {
  const subscriptions = await prisma.subscription.findMany({
    include: {
      memberships: { include: { person: true } },
      cycles: { include: { payments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Subscriptions</h1>
          <p className="text-slate-500">The recurring bills you split with your group.</p>
        </div>
        <Link
          href="/subscriptions/new"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + New subscription
        </Link>
      </div>

      {subscriptions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-500">
          No subscriptions yet. Create one like &quot;YouTube Premium&quot; or &quot;ATT Mobile Bill&quot; to get started.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {subscriptions.map((s) => {
            const pending = s.cycles.flatMap((c) => c.payments).filter((p) => !p.paid);
            const pendingTotal = pending.reduce((sum, p) => sum + p.amountOwed, 0);
            return (
              <Link
                key={s.id}
                href={`/subscriptions/${s.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{s.name}</p>
                    <p className="text-sm text-slate-500">${s.amount.toFixed(2)}/mo · {s.memberships.length} member{s.memberships.length === 1 ? "" : "s"}</p>
                  </div>
                  {pending.length > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                      ${pendingTotal.toFixed(2)} pending
                    </span>
                  )}
                </div>
                {s.description && <p className="mt-2 text-sm text-slate-500">{s.description}</p>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
