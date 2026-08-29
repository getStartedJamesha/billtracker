import { prisma } from "@/lib/prisma";
import {
  addPhoneAlias,
  createPerson,
  deletePerson,
  mergeIntoPerson,
  removePhoneAlias,
  updatePersonName,
  updatePersonNote,
} from "@/lib/actions";
import { formatPhoneDashed } from "@/lib/parseBill";

export default async function PeoplePage() {
  const people = await prisma.person.findMany({
    include: { memberships: { include: { subscription: true } }, phoneAliases: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">People</h1>
        <p className="text-slate-500">Everyone in your circle. Add them once, then include them on any subscription.</p>
        <p className="mt-1 text-sm text-slate-500">
          Sharing a plan with a spouse, kid, or roommate who has their own line? Add that line as an
          &quot;other number&quot; below so a bill charges it to the same person instead of creating a new one.
          If a bill upload already created a separate person for that number, adding it here merges
          that duplicate&apos;s subscriptions and payment history into this person and removes it. You
          can also merge two people directly by name using &quot;Merge into&quot; — handy once you&apos;ve
          renamed an auto-generated &quot;User12&quot; and want to fold another duplicate into them without
          knowing their phone number.
        </p>
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
                <th className="px-4 py-2 font-medium">Other numbers (billed to this person)</th>
                <th className="px-4 py-2 font-medium">Subscriptions</th>
                <th className="px-4 py-2 font-medium">Merge into</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {people.map((person) => (
                <tr key={person.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <form action={updatePersonName.bind(null, person.id)} className="flex gap-1">
                      <input
                        name="name"
                        required
                        defaultValue={person.name}
                        className="w-40 rounded border border-slate-300 px-2 py-1 text-sm font-medium text-slate-900 focus:border-brand-500 focus:outline-none"
                      />
                      <button className="text-xs font-medium text-brand-600 hover:underline">Save</button>
                    </form>
                    <form action={updatePersonNote.bind(null, person.id)} className="mt-1 flex gap-1">
                      <input
                        name="note"
                        defaultValue={person.note ?? ""}
                        placeholder="+ add a note (e.g. same household as…)"
                        className="w-56 rounded border border-slate-300 px-2 py-1 text-xs font-normal text-slate-600 focus:border-brand-500 focus:outline-none"
                      />
                      <button className="text-xs font-medium text-brand-600 hover:underline">Save</button>
                    </form>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{person.phone || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <div className="flex flex-wrap gap-1">
                      {person.phoneAliases.map((alias) => (
                        <span
                          key={alias.id}
                          className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                        >
                          {formatPhoneDashed(alias.phone)}
                          <form action={removePhoneAlias.bind(null, alias.id)}>
                            <button
                              type="submit"
                              title="Remove this number"
                              className="text-slate-400 hover:text-red-600"
                            >
                              ✕
                            </button>
                          </form>
                        </span>
                      ))}
                    </div>
                    <form action={addPhoneAlias.bind(null, person.id)} className="mt-1 flex gap-1">
                      <input
                        name="phone"
                        type="tel"
                        placeholder="+ add number"
                        className="w-32 rounded border border-slate-300 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                      />
                      <button className="text-xs font-medium text-brand-600 hover:underline">Add</button>
                    </form>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {person.memberships.length === 0
                      ? "—"
                      : person.memberships.map((m) => m.subscription.name).join(", ")}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {people.length > 1 && (
                      <form action={mergeIntoPerson.bind(null, person.id)} className="flex gap-1">
                        <select
                          name="targetPersonId"
                          required
                          defaultValue=""
                          className="w-36 rounded border border-slate-300 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                        >
                          <option value="" disabled>
                            Choose person…
                          </option>
                          {people
                            .filter((other) => other.id !== person.id)
                            .map((other) => (
                              <option key={other.id} value={other.id}>
                                {other.name}
                              </option>
                            ))}
                        </select>
                        <button
                          title="Merge this person into the one selected - moves their subscriptions and payment history over, then removes this row"
                          className="text-xs font-medium text-brand-600 hover:underline"
                        >
                          Merge
                        </button>
                      </form>
                    )}
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
