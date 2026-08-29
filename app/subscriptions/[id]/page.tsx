import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  addExistingMember,
  addNewMember,
  deleteCycle,
  deleteSubscription,
  generateCycle,
  removeMember,
  togglePayment,
  updateMemberShare,
  uploadBillFile,
} from "@/lib/actions";
import { formatPhoneDashed } from "@/lib/parseBill";
import { currentPeriodLabel, periodLabelToDisplay } from "@/lib/period";

export default async function SubscriptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const subscription = await prisma.subscription.findUnique({
    where: { id },
    include: {
      memberships: { include: { person: { include: { phoneAliases: true } } } },
      cycles: {
        include: { payments: { include: { person: true } } },
        orderBy: { periodLabel: "desc" },
      },
    },
  });

  if (!subscription) notFound();

  const memberPersonIds = new Set(subscription.memberships.map((m) => m.personId));
  const availablePeople = await prisma.person.findMany({
    where: { id: { notIn: Array.from(memberPersonIds) } },
    orderBy: { name: "asc" },
  });

  const hasCurrentCycle = subscription.cycles.some((c) => c.periodLabel === currentPeriodLabel());

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{subscription.name}</h1>
          {subscription.description && <p className="text-slate-500">{subscription.description}</p>}
          <p className="mt-1 text-sm text-slate-500">
            ${subscription.amount.toFixed(2)}/mo · {subscription.splitType === "custom" ? "custom split" : "equal split"}
            {subscription.dueDay ? ` · due day ${subscription.dueDay}` : ""}
          </p>
        </div>
        <form action={deleteSubscription.bind(null, subscription.id)}>
          <button className="text-sm font-medium text-red-600 hover:underline">Delete subscription</button>
        </form>
      </div>

      {/* Members */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Group members</h2>
        {subscription.memberships.length === 0 ? (
          <p className="text-sm text-slate-500">No members yet. Add someone below.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Phone</th>
                  {subscription.splitType === "custom" && <th className="px-4 py-2 font-medium">Share ($)</th>}
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subscription.memberships.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {m.person.name}
                      {m.person.note && <div className="text-xs font-normal text-slate-400">{m.person.note}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {[m.person.phone, ...m.person.phoneAliases.map((a) => formatPhoneDashed(a.phone))]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    {subscription.splitType === "custom" && (
                      <td className="px-4 py-3">
                        <form action={updateMemberShare.bind(null, subscription.id, m.id)} className="flex items-center gap-2">
                          <input
                            name="customShare"
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={m.customShare ?? ""}
                            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                          />
                          <button className="text-xs font-medium text-brand-600 hover:underline">Save</button>
                        </form>
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <form action={removeMember.bind(null, subscription.id, m.id)}>
                        <button className="text-xs font-medium text-red-600 hover:underline">Remove</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap gap-4">
          {availablePeople.length > 0 && (
            <form action={addExistingMember.bind(null, subscription.id)} className="flex items-center gap-2">
              <select name="personId" className="rounded-md border border-slate-300 px-3 py-2 text-sm" required>
                <option value="">Add existing person…</option>
                {availablePeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
                Add
              </button>
            </form>
          )}

          <form action={addNewMember.bind(null, subscription.id)} className="flex flex-wrap items-center gap-2">
            <input name="name" placeholder="New person's name" required className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <input name="phone" placeholder="Phone number" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <button className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
              Add new person
            </button>
          </form>
        </div>
      </section>

      {/* Generate cycle */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Generate a monthly bill</h2>
        {hasCurrentCycle ? (
          <p className="text-sm text-slate-500">
            A bill for {periodLabelToDisplay(currentPeriodLabel())} has already been generated below.
          </p>
        ) : (
          <form action={generateCycle.bind(null, subscription.id)} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <label className="block text-xs font-medium text-slate-700">Month (YYYY-MM)</label>
              <input
                name="periodLabel"
                defaultValue={currentPeriodLabel()}
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
                defaultValue={subscription.amount}
                className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Generate bill
            </button>
            {subscription.memberships.length === 0 && (
              <p className="text-xs text-slate-500">
                No members yet — that&apos;s fine. Generate the bill, then upload the PDF below and
                people will be added automatically from it.
              </p>
            )}
          </form>
        )}
      </section>

      {/* Cycles */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Bill history</h2>
        {subscription.cycles.length === 0 ? (
          <p className="text-sm text-slate-500">No bills generated yet.</p>
        ) : (
          subscription.cycles.map((cycle) => {
            const paidCount = cycle.payments.filter((p) => p.paid).length;
            return (
              <div key={cycle.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{periodLabelToDisplay(cycle.periodLabel)}</p>
                    <p className="text-sm text-slate-500">
                      ${cycle.totalAmount.toFixed(2)} total · {paidCount}/{cycle.payments.length} paid
                      {cycle.dueDate ? ` · due ${new Date(cycle.dueDate).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <form action={deleteCycle.bind(null, subscription.id, cycle.id)}>
                    <button className="text-xs font-medium text-red-600 hover:underline">Delete bill</button>
                  </form>
                </div>

                <ul className="mt-3 divide-y divide-slate-100">
                  {cycle.payments.map((p) => (
                    <li key={p.id}>
                      <form action={togglePayment.bind(null, subscription.id, p.id)}>
                        <button
                          type="submit"
                          title="Tap to toggle paid status"
                          className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-3 text-left text-sm transition active:scale-[0.99] ${
                            p.paid ? "bg-slate-50" : "hover:bg-green-50"
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <span
                              className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                                p.paid
                                  ? "border-green-500 bg-green-500 text-white"
                                  : "border-slate-300 text-transparent"
                              }`}
                            >
                              ✓
                            </span>
                            <span className={`font-medium ${p.paid ? "text-slate-400 line-through" : "text-slate-800"}`}>
                              {p.person.name}
                            </span>
                          </span>
                          <span className={`font-medium ${p.paid ? "text-slate-400 line-through" : "text-slate-700"}`}>
                            ${p.amountOwed.toFixed(2)}
                          </span>
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 border-t border-slate-100 pt-3">
                  {cycle.billFileName ? (
                    <p className="text-xs text-slate-500">
                      Bill on file:{" "}
                      <Link href={cycle.billFilePath || "#"} className="text-brand-600 hover:underline" target="_blank">
                        {cycle.billFileName}
                      </Link>
                      {cycle.extractedNote && ` — ${cycle.extractedNote}`}
                    </p>
                  ) : (
                    <form action={uploadBillFile.bind(null, subscription.id, cycle.id)} className="flex items-center gap-2">
                      <input type="file" name="bill" accept="application/pdf,image/*" required className="text-xs" />
                      <button className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200">
                        Upload bill
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
