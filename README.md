# BillTracker

Track monthly bills (Netflix, YouTube Premium, an ATT family plan, rent, whatever)
that you split with a rotating cast of friends. Each subscription has its own
group of people; you generate a bill for the month, everyone's share is
calculated automatically, and you check people off as they pay you back.

## Stack

- **Next.js 16** (App Router) + TypeScript, React Server Components + Server Actions
  (no separate REST/API layer — mutations are plain server functions called
  directly from forms)
- **Prisma + SQLite** for storage — zero setup, single file database
- **Tailwind CSS** for styling
- `pdf-parse` for best-effort auto-extraction of a bill's total — and, for
  carrier bills that itemize charges by phone line, a full per-line-item
  split — from an uploaded PDF

## Getting started

```bash
npm install
npx prisma migrate deploy   # creates prisma/dev.db
npm run dev                 # http://localhost:3000
```

To reset all data at any point: delete `prisma/dev.db` and re-run `npx prisma migrate deploy`.

Want to run this permanently on your own hardware (e.g. a Raspberry Pi) instead
of just locally? See [`deploy/README.md`](deploy/README.md) for a step-by-step
guide, including a systemd service so it survives reboots and a backup script
for a network drive.

## Data model

- **Person** — name + phone number, reusable across any number of subscriptions.
- **Subscription** — a recurring bill ("YouTube Premium", "ATT Mobile Bill"),
  with a default monthly amount, a split method (equal or custom-per-person),
  and an optional due day of month.
- **Membership** — links people to a subscription's group; carries a custom
  dollar share when the subscription uses custom splitting.
- **BillCycle** — one month's instance of a subscription's bill (e.g. "August
  2026"), with its own total (in case it varies month to month) and an
  optional uploaded bill file.
- **Payment** — one person's share of one bill cycle, with a paid/unpaid flag.
- **Charge** — a one-off amount someone owes, logged directly against a
  person without a Subscription/BillCycle at all (e.g. "Sam owes $20 for
  dinner").

## How it's meant to be used

1. Add the people you split bills with once, on the **People** page (name + phone).
2. Create a **Subscription** for each recurring bill, and pick who's in that
   particular group — the same person can be in multiple groups, and each
   subscription's group is independent.
3. Each month, open the subscription and hit **Generate bill** — it creates
   that month's cycle and splits the total across current members (equal
   split by default, or each person's fixed custom share if you set the
   subscription to custom splitting). The month field defaults to the
   current month (or the one right after your latest bill), but it's a
   plain text field — change it to any YYYY-MM to backfill a month you
   missed or get ahead on a future one. Every month is tracked as its own
   entry in **Bill history**, each with its own total, split, and upload,
   so nothing about a past or future month gets mixed up with the current
   one.
4. For a group you don't want to type in by hand (e.g. everyone on a phone
   carrier bill), you can skip step 2 entirely — just click **Generate
   bill** with no members yet, then upload the PDF:
   - If it's a phone/carrier-style bill that itemizes charges per line
     (look for a repeated "Total for &lt;phone number&gt;" pattern — this is
     how AT&T bills are formatted, and likely others), BillTracker extracts
     every line's phone number and exact charge, matches each one to an
     existing person by phone number or [alias](#merging-a-phone-number-into-an-existing-person)
     (or creates a new person named `User12`, `User13`, ... if no match
     exists), sets the subscription to custom splitting, and rebuilds that
     cycle's payments to match the bill exactly — no manual entry required.
   - Otherwise, it falls back to looking for a single line like
     "Total Due: $145.32" and re-splits the cycle evenly using that amount.
   - It also reads the bill's own issue/bill/statement date and, if that
     falls in a different month than the cycle you uploaded it to (carriers
     often issue next month's bill a few days early), relabels the cycle to
     match — so "the July bill" stays filed as July even if you happened to
     upload it in August. If that would collide with a bill you've already
     generated for that other month, it leaves the label alone and adds a
     note instead of guessing.
5. As friends pay you back, tap their row (or **Mark paid**) — it's a
   single tap, no confirmation dialog, and it flips right back if you tap
   it again by mistake.
6. The **Dashboard** rolls up every unpaid share across every subscription,
   grouped by person with their phone number handy, flags anything past its
   due date as overdue, and calls out any subscription that hasn't had a
   bill generated yet this month. A **Pending / Paid** toggle at the top of
   the transfers list switches between what's still owed and everyone who's
   already settled up.
7. For a one-time cost that doesn't need a whole subscription (e.g. "Sam
   owes $20 for dinner"), use **Add a one-off charge** right on the
   Dashboard — pick who, what for, and how much. It shows up alongside
   subscription payments in the same person-grouped list, with the same
   one-tap Mark paid.
8. Made a mistake on an already-generated bill, or need to add a late fee?
   Each payment row in a subscription's Bill history has an **Edit amount**
   toggle to correct just that one person's share, without deleting and
   regenerating the whole cycle. A cycle itself has the same kind of **Edit
   month** toggle next to its heading, for renaming one that ended up under
   the wrong month (including a bill already uploaded before this app could
   detect its issue date automatically) — it's blocked from colliding with
   another cycle you've already generated for that month.

### Merging a phone number into an existing person

Some bills print two lines for what's really one person — a spouse's line, a
kid's line, a wearable/watch line on the same account. On the **People**
page, use the "+ add number" field next to anyone to attach an extra phone
number to them. From then on, a bill line for that number is billed to that
person instead of creating a separate one.

If a bill was already uploaded before you added the alias (so a duplicate
person already exists for that number), adding the alias detects the
duplicate automatically, merges its subscriptions and payment history into
the person you added it to (summing amounts if both were already on the
same bill), and removes the now-empty duplicate — nothing to clean up by
hand.

A person's **name** is editable inline too (useful for replacing an
auto-generated `User12` with their real name), and a free-text **note**
next to their name is handy for context that doesn't need a full merge
(e.g. "same household as Sameena"). If you already know two people are the
same but don't know their phone number, use **Merge into** on the People
page to fold one directly into the other by name instead — it carries over
the merged-away person's phone number and any aliases they had, so a
future bill upload for that number still resolves correctly.

Once merged, every phone number that resolves to a person shows up
together (primary + aliases) wherever that person appears — the People
page, a subscription's Group members table, and the Dashboard's pending
transfers.

## Ideas for enhancement

Roughly in order of how much value they'd add relative to effort:

- **AI-based bill parsing for other formats.** Itemized per-line splitting
  (see above) is heuristic — it looks for a specific "Total for &lt;phone&gt;"
  anchor, which covers AT&T-style bills but not every carrier's layout, and
  it can't tell a meaningful per-person label from a repeated account-holder
  name. Feeding the extracted text (or a photo) through an LLM instead of a
  fixed regex could generalize to any bill format and any kind of shared
  expense (utilities, rent, restaurant receipts), not just phone lines.
  Image bills (photos of a receipt) would also need real OCR first —
  Tesseract.js or a vision-capable model.
- **Reminders.** Since every person already has a phone number on file, an
  obvious next step is one-tap reminders — a `tel:`/SMS deep link, or actual
  automated texts (Twilio) / WhatsApp messages when a share is overdue.
- **Recurring auto-generation.** A monthly cron/background job that
  generates each subscription's bill cycle automatically on the 1st (or on
  its due day), instead of requiring a manual "Generate bill" click.
- **Payment links.** Attach a Venmo/PayPal/Cash App handle per person or per
  subscription and turn "Mark paid" into a real payment request link, not
  just a manual checkbox.
- **Multi-user accounts & auth.** Right now this is single-user/local. Real
  shared use (e.g. two roommates both checking off payments) needs login,
  and probably a notion of "who is the payer" vs. "who owes," rather than
  assuming one implicit account owner.
- **Notifications/email digest.** A weekly "here's who still owes you"
  summary, rather than requiring someone to open the dashboard.
- **CSV/export & reporting.** Export a subscription's full payment history,
  or a per-person running total across all subscriptions over time.
- **Better currency/i18n handling.** Amounts are plain floats in USD; real
  multi-currency support would want a proper decimal/money type.
