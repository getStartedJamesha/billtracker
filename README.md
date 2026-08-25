# BillTracker

Track monthly bills (Netflix, YouTube Premium, an ATT family plan, rent, whatever)
that you split with a rotating cast of friends. Each subscription has its own
group of people; you generate a bill for the month, everyone's share is
calculated automatically, and you check people off as they pay you back.

## Stack

- **Next.js 14** (App Router) + TypeScript, React Server Components + Server Actions
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

## How it's meant to be used

1. Add the people you split bills with once, on the **People** page (name + phone).
2. Create a **Subscription** for each recurring bill, and pick who's in that
   particular group — the same person can be in multiple groups, and each
   subscription's group is independent.
3. Each month, open the subscription and hit **Generate bill** — it creates
   that month's cycle and splits the total across current members (equal
   split by default, or each person's fixed custom share if you set the
   subscription to custom splitting).
4. Optionally **upload the actual bill** (PDF) to that cycle:
   - If it's a phone/carrier-style bill that itemizes charges per line
     (look for a repeated "Total for &lt;phone number&gt;" pattern — this is
     how AT&T bills are formatted, and likely others), BillTracker extracts
     every line's phone number and exact charge, matches each one to an
     existing person by phone number (or creates a new person named
     `User12`, `User13`, ... if no match exists), sets the subscription to
     custom splitting, and rebuilds that cycle's payments to match the bill
     exactly — no manual entry required.
   - Otherwise, it falls back to looking for a single line like
     "Total Due: $145.32" and re-splits the cycle evenly using that amount.
5. As friends pay you back, click **Mark paid** next to their name.
6. The **Dashboard** rolls up every unpaid share across every subscription,
   grouped by person with their phone number handy, flags anything past its
   due date as overdue, and calls out any subscription that hasn't had a
   bill generated yet this month.

## Known limitation

Dependency audit flags several Next.js/PostCSS advisories that are only fully
resolved by upgrading to Next 15/16 (a breaking change to the app's routing
and config APIs). None of the affected surfaces (image optimizer, middleware,
edge server actions) are used by this app. Worth revisiting when there's
appetite for the migration.

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
- **Editable bill history.** Currently a cycle's total/split is fixed once
  generated (short of re-uploading a file). Inline editing of an individual
  person's owed amount after the fact (a late fee, a partial payment) would
  make it more forgiving.
- **Notifications/email digest.** A weekly "here's who still owes you"
  summary, rather than requiring someone to open the dashboard.
- **CSV/export & reporting.** Export a subscription's full payment history,
  or a per-person running total across all subscriptions over time.
- **Better currency/i18n handling.** Amounts are plain floats in USD; real
  multi-currency support would want a proper decimal/money type.
