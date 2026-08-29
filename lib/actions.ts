"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { currentPeriodLabel, dueDateForPeriod } from "./period";
import { normalizePhoneDigits, tryExtractLineItemsFromPdf, tryExtractTotalFromPdf } from "./parseBill";

function splitEqually(total: number, count: number): number[] {
  if (count === 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  const shares = new Array(count).fill(base);
  for (let i = 0; i < remainder; i++) shares[i] += 1;
  return shares.map((c) => c / 100);
}

// ---------- People ----------

export async function createPerson(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  if (!name) throw new Error("Name is required");

  await prisma.person.create({ data: { name, phone: phone || null } });
  revalidatePath("/people");
  revalidatePath("/subscriptions");
}

export async function deletePerson(personId: string) {
  await prisma.person.delete({ where: { id: personId } });
  revalidatePath("/people");
  revalidatePath("/subscriptions");
  revalidatePath("/");
}

// Moves everything belonging to `fromPersonId` (subscription memberships and
// bill payments) onto `intoPersonId`, combining amounts where both are
// already on the same subscription/cycle, then removes the now-empty
// duplicate. Used when a phone number turns out to belong to someone who
// already has their own Person record (e.g. a bill auto-created separate
// entries for a spouse's or child's line before it was aliased).
async function mergePersonInto(fromPersonId: string, intoPersonId: string) {
  const [fromMemberships, fromPayments] = await Promise.all([
    prisma.membership.findMany({ where: { personId: fromPersonId } }),
    prisma.payment.findMany({ where: { personId: fromPersonId } }),
  ]);

  for (const m of fromMemberships) {
    const existing = await prisma.membership.findUnique({
      where: { subscriptionId_personId: { subscriptionId: m.subscriptionId, personId: intoPersonId } },
    });
    if (existing) {
      const combinedShare = (existing.customShare ?? 0) + (m.customShare ?? 0);
      await prisma.membership.update({ where: { id: existing.id }, data: { customShare: combinedShare } });
      await prisma.membership.delete({ where: { id: m.id } });
    } else {
      await prisma.membership.update({ where: { id: m.id }, data: { personId: intoPersonId } });
    }
  }

  for (const p of fromPayments) {
    const existing = await prisma.payment.findUnique({
      where: { billCycleId_personId: { billCycleId: p.billCycleId, personId: intoPersonId } },
    });
    if (existing) {
      await prisma.payment.update({
        where: { id: existing.id },
        data: {
          amountOwed: existing.amountOwed + p.amountOwed,
          paid: existing.paid && p.paid,
          paidAt: existing.paid && p.paid ? existing.paidAt : null,
        },
      });
      await prisma.payment.delete({ where: { id: p.id } });
    } else {
      await prisma.payment.update({ where: { id: p.id }, data: { personId: intoPersonId } });
    }
  }

  await prisma.person.delete({ where: { id: fromPersonId } });
}

// Attaches an extra phone number (e.g. a spouse's or child's line) to an
// existing person, so bill parsing bills that line to them instead of
// creating a separate person for it. If that number already belongs to a
// different person (e.g. an earlier bill upload auto-created a separate
// entry for it before it was aliased), that duplicate is merged into this
// person - their subscriptions and payment history move over - instead of
// being left behind as an orphaned record.
export async function addPhoneAlias(personId: string, formData: FormData) {
  const raw = String(formData.get("phone") || "").trim();
  if (!raw) throw new Error("Phone number is required");

  const phoneDigits = normalizePhoneDigits(raw);
  if (phoneDigits.length !== 10) throw new Error("Enter a 10-digit phone number");

  const target = await prisma.person.findUniqueOrThrow({ where: { id: personId } });
  if (target.phone && normalizePhoneDigits(target.phone) === phoneDigits) {
    throw new Error("That's already this person's own phone number");
  }

  const existingAlias = await prisma.personPhone.findUnique({ where: { phone: phoneDigits } });
  if (existingAlias) {
    if (existingAlias.personId === personId) return; // already aliased here
    throw new Error("That number is already mapped to another person");
  }

  const peopleWithPhone = await prisma.person.findMany({ where: { phone: { not: null } } });
  const primaryOwner = peopleWithPhone.find(
    (p) => p.id !== personId && p.phone && normalizePhoneDigits(p.phone) === phoneDigits
  );
  if (primaryOwner) {
    await mergePersonInto(primaryOwner.id, personId);
  }

  await prisma.personPhone.create({ data: { personId, phone: phoneDigits } });
  revalidatePath("/people");
  revalidatePath("/subscriptions");
  revalidatePath("/");
}

export async function removePhoneAlias(aliasId: string) {
  await prisma.personPhone.delete({ where: { id: aliasId } });
  revalidatePath("/people");
}

// ---------- Subscriptions ----------

export async function createSubscription(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const amount = parseFloat(String(formData.get("amount") || "0"));
  const splitType = String(formData.get("splitType") || "equal");
  const dueDayRaw = String(formData.get("dueDay") || "").trim();
  const dueDay = dueDayRaw ? Math.min(31, Math.max(1, parseInt(dueDayRaw, 10))) : null;

  if (!name) throw new Error("Name is required");
  if (!amount || amount <= 0) throw new Error("Amount must be greater than 0");

  const personIds = formData.getAll("personIds").map(String).filter(Boolean);

  let newMembers: { name: string; phone?: string }[] = [];
  const newMembersRaw = String(formData.get("newMembersJson") || "[]");
  try {
    const parsed = JSON.parse(newMembersRaw);
    if (Array.isArray(parsed)) {
      newMembers = parsed
        .filter((m) => m && typeof m.name === "string" && m.name.trim())
        .map((m) => ({ name: m.name.trim(), phone: m.phone ? String(m.phone).trim() : undefined }));
    }
  } catch {
    // ignore malformed JSON, treat as no extra members
  }

  const subscription = await prisma.subscription.create({
    data: { name, description: description || null, amount, splitType, dueDay },
  });

  for (const personId of personIds) {
    await prisma.membership.create({ data: { subscriptionId: subscription.id, personId } });
  }

  for (const m of newMembers) {
    const person = await prisma.person.create({ data: { name: m.name, phone: m.phone || null } });
    await prisma.membership.create({ data: { subscriptionId: subscription.id, personId: person.id } });
  }

  revalidatePath("/subscriptions");
  revalidatePath("/people");
  redirect(`/subscriptions/${subscription.id}`);
}

export async function deleteSubscription(subscriptionId: string) {
  await prisma.subscription.delete({ where: { id: subscriptionId } });
  revalidatePath("/subscriptions");
  revalidatePath("/");
  redirect("/subscriptions");
}

export async function addExistingMember(subscriptionId: string, formData: FormData) {
  const personId = String(formData.get("personId") || "");
  if (!personId) return;
  await prisma.membership.upsert({
    where: { subscriptionId_personId: { subscriptionId, personId } },
    update: {},
    create: { subscriptionId, personId },
  });
  revalidatePath(`/subscriptions/${subscriptionId}`);
}

export async function addNewMember(subscriptionId: string, formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  if (!name) throw new Error("Name is required");

  const person = await prisma.person.create({ data: { name, phone: phone || null } });
  await prisma.membership.create({ data: { subscriptionId, personId: person.id } });
  revalidatePath(`/subscriptions/${subscriptionId}`);
  revalidatePath("/people");
}

export async function removeMember(subscriptionId: string, membershipId: string) {
  await prisma.membership.delete({ where: { id: membershipId } });
  revalidatePath(`/subscriptions/${subscriptionId}`);
}

export async function updateMemberShare(subscriptionId: string, membershipId: string, formData: FormData) {
  const customShare = parseFloat(String(formData.get("customShare") || "0"));
  await prisma.membership.update({
    where: { id: membershipId },
    data: { customShare: Number.isNaN(customShare) ? null : customShare },
  });
  revalidatePath(`/subscriptions/${subscriptionId}`);
}

// ---------- Bill cycles ----------

export async function generateCycle(subscriptionId: string, formData: FormData) {
  const subscription = await prisma.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
    include: { memberships: true },
  });

  const periodLabel = String(formData.get("periodLabel") || currentPeriodLabel());
  const totalAmount = parseFloat(String(formData.get("totalAmount") || subscription.amount));

  const existing = await prisma.billCycle.findUnique({
    where: { subscriptionId_periodLabel: { subscriptionId, periodLabel } },
  });
  if (existing) throw new Error(`A bill cycle for ${periodLabel} already exists`);

  const memberships = subscription.memberships;
  const equalShares = splitEqually(totalAmount, memberships.length);

  const cycle = await prisma.billCycle.create({
    data: {
      subscriptionId,
      periodLabel,
      totalAmount,
      dueDate: dueDateForPeriod(periodLabel, subscription.dueDay),
    },
  });

  await Promise.all(
    memberships.map((m, i) =>
      prisma.payment.create({
        data: {
          billCycleId: cycle.id,
          personId: m.personId,
          amountOwed: subscription.splitType === "custom" && m.customShare != null ? m.customShare : equalShares[i],
        },
      })
    )
  );

  revalidatePath(`/subscriptions/${subscriptionId}`);
  revalidatePath("/");
}

export async function deleteCycle(subscriptionId: string, cycleId: string) {
  await prisma.billCycle.delete({ where: { id: cycleId } });
  revalidatePath(`/subscriptions/${subscriptionId}`);
  revalidatePath("/");
}

export async function togglePayment(subscriptionId: string, paymentId: string) {
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  await prisma.payment.update({
    where: { id: paymentId },
    data: { paid: !payment.paid, paidAt: !payment.paid ? new Date() : null },
  });
  revalidatePath(`/subscriptions/${subscriptionId}`);
  revalidatePath("/");
}

// Finds or creates a Person for a bill line's phone number, matching by
// digits-only phone against everyone in the system (not just current
// members) so a person billed elsewhere is recognized rather than
// duplicated. New people are named sequentially ("User12") unless the bill
// itself prints a usable per-line name.
async function resolvePersonForLine(phoneDigits: string, name: string | null, nextUserNumberRef: { n: number }) {
  const people = await prisma.person.findMany({ include: { phoneAliases: true } });
  const existing = people.find(
    (p) =>
      (p.phone && normalizePhoneDigits(p.phone) === phoneDigits) ||
      p.phoneAliases.some((a) => a.phone === phoneDigits)
  );
  if (existing) return { person: existing, created: false };

  const phoneFormatted = `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`;
  const personName = name || `User${nextUserNumberRef.n++}`;
  const person = await prisma.person.create({ data: { name: personName, phone: phoneFormatted } });
  return { person, created: true };
}

async function applyLineItemExtraction(
  subscriptionId: string,
  cycleId: string,
  items: { phoneDigits: string; amount: number; name: string | null }[]
) {
  const existingPeople = await prisma.person.findMany();
  const userNumbers = existingPeople
    .map((p) => p.name.match(/^User(\d+)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => parseInt(m[1], 10));
  const nextUserNumberRef = { n: (userNumbers.length ? Math.max(...userNumbers) : 0) + 1 };

  let createdCount = 0;
  let matchedCount = 0;
  // Multiple bill lines can resolve to the same person (e.g. a spouse's or
  // child's line aliased to them) - aggregate their amounts rather than
  // creating duplicate memberships/payments for the same person.
  const amountByPerson = new Map<string, number>();

  for (const item of items) {
    const { person, created } = await resolvePersonForLine(item.phoneDigits, item.name, nextUserNumberRef);
    if (created) createdCount++;
    else matchedCount++;
    amountByPerson.set(person.id, (amountByPerson.get(person.id) ?? 0) + item.amount);
  }

  await Promise.all(
    Array.from(amountByPerson.entries()).map(([personId, amount]) =>
      prisma.membership.upsert({
        where: { subscriptionId_personId: { subscriptionId, personId } },
        update: { customShare: amount },
        create: { subscriptionId, personId, customShare: amount },
      })
    )
  );

  await prisma.subscription.update({ where: { id: subscriptionId }, data: { splitType: "custom" } });

  const existingPayments = await prisma.payment.findMany({ where: { billCycleId: cycleId } });
  const paidByPerson = new Map(existingPayments.filter((p) => p.paid).map((p) => [p.personId, p.paidAt]));
  await prisma.payment.deleteMany({ where: { billCycleId: cycleId } });
  await Promise.all(
    Array.from(amountByPerson.entries()).map(([personId, amount]) =>
      prisma.payment.create({
        data: {
          billCycleId: cycleId,
          personId,
          amountOwed: amount,
          paid: paidByPerson.has(personId),
          paidAt: paidByPerson.get(personId) ?? null,
        },
      })
    )
  );

  const total = Math.round(Array.from(amountByPerson.values()).reduce((sum, a) => sum + a, 0) * 100) / 100;
  const parts = [`Auto-detected ${items.length} per-line charges totaling $${total.toFixed(2)} from the uploaded PDF.`];
  if (matchedCount > 0) parts.push(`Matched ${matchedCount} existing ${matchedCount === 1 ? "person" : "people"} by phone number.`);
  if (createdCount > 0) parts.push(`Added ${createdCount} new ${createdCount === 1 ? "person" : "people"} to this subscription.`);

  return { total, note: parts.join(" ") };
}

export async function uploadBillFile(subscriptionId: string, cycleId: string, formData: FormData) {
  const file = formData.get("bill") as File | null;
  if (!file || file.size === 0) throw new Error("Choose a file to upload");

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(uploadsDir, { recursive: true });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedName = `${cycleId}-${randomUUID()}-${safeName}`;
  await fs.writeFile(path.join(uploadsDir, storedName), buffer);

  let extractedNote = "File uploaded.";
  let updateData: { billFilePath: string; billFileName: string; extractedNote: string; totalAmount?: number } = {
    billFilePath: `/uploads/${storedName}`,
    billFileName: file.name,
    extractedNote,
  };

  if (file.type === "application/pdf" || safeName.toLowerCase().endsWith(".pdf")) {
    const lineResult = await tryExtractLineItemsFromPdf(buffer);

    if (lineResult.items.length >= 2) {
      const { total, note } = await applyLineItemExtraction(subscriptionId, cycleId, lineResult.items);
      extractedNote = note;
      updateData.extractedNote = extractedNote;
      updateData.totalAmount = total;
    } else {
      const result = await tryExtractTotalFromPdf(buffer);
      extractedNote = result.note;
      updateData.extractedNote = extractedNote;

      if (result.amount != null) {
        const subscription = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
        const cycle = await prisma.billCycle.findUniqueOrThrow({ where: { id: cycleId }, include: { payments: true } });

        updateData.totalAmount = result.amount;

        if (subscription.splitType !== "custom") {
          const shares = splitEqually(result.amount, cycle.payments.length);
          await Promise.all(
            cycle.payments.map((p, i) => prisma.payment.update({ where: { id: p.id }, data: { amountOwed: shares[i] } }))
          );
        }
      }
    }
  } else {
    extractedNote = "Image uploaded for reference. Automatic amount detection currently only supports PDF bills — enter the total manually if needed.";
    updateData.extractedNote = extractedNote;
  }

  await prisma.billCycle.update({ where: { id: cycleId }, data: updateData });

  revalidatePath(`/subscriptions/${subscriptionId}`);
  revalidatePath("/");
}
