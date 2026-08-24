import { prisma } from "@/lib/prisma";
import { createPerson, deletePerson } from "@/lib/actions";

export default async function PeoplePage() {
  const people = await prisma.person.findMany({
    include: { memberships: { include: { subscription: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">People</h1>
        <p className="text-slate-500">Everyone in your circle. Add them once, then include them on any subscription.</p>
      </div>

      <form action={createPerson} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-sm font-medium text-slate-700">Name</label>
          <input
            name="name"
            required
            placeholder="Jordan Lee"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-sm font-medium text-slate-700">Phone number</label>
          <input
            name="phone"
            type="tel"
            placeholder="(555) 123-4567"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
        <button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Add person
        </button>
      </form>

      {people.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-500">
          No one added yet — add your first friend above.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Phone</th>
                <th className="px-4 py-2 font-medium">Subscriptions</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {people.map((person) => (
                <tr key={person.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{person.name}</td>
                  <td className="px-4 py-3 text-slate-600">{person.phone || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {person.memberships.length === 0
                      ? "—"
                      : person.memberships.map((m) => m.subscription.name).join(", ")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={deletePerson.bind(null, person.id)}>
                      <button className="text-xs font-medium text-red-600 hover:underline">Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
