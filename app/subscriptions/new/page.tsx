import { prisma } from "@/lib/prisma";
import NewSubscriptionForm from "@/components/NewSubscriptionForm";

export default async function NewSubscriptionPage() {
  const people = await prisma.person.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">New subscription</h1>
        <p className="text-slate-500">Set up a bill and choose who&apos;s splitting it.</p>
      </div>
      <NewSubscriptionForm people={people} />
    </div>
  );
}
