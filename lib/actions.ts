"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { currentPeriodLabel, dueDateForPeriod } from "./period";
import { tryExtractTotalFromPdf } from "./parseBill";

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
  } else {
    extractedNote = "Image uploaded for reference. Automatic amount detection currently only supports PDF bills — enter the total manually if needed.";
    updateData.extractedNote = extractedNote;
  }

  await prisma.billCycle.update({ where: { id: cycleId }, data: updateData });

  revalidatePath(`/subscriptions/${subscriptionId}`);
  revalidatePath("/");
}
