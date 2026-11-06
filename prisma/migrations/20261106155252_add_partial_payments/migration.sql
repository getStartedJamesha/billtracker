-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Charge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "amountPaid" REAL NOT NULL DEFAULT 0,
    "paymentNote" TEXT,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Charge_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Charge" ("amount", "createdAt", "description", "id", "paid", "paidAt", "personId") SELECT "amount", "createdAt", "description", "id", "paid", "paidAt", "personId" FROM "Charge";
DROP TABLE "Charge";
ALTER TABLE "new_Charge" RENAME TO "Charge";
CREATE TABLE "new_Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "billCycleId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "amountOwed" REAL NOT NULL,
    "amountPaid" REAL NOT NULL DEFAULT 0,
    "paymentNote" TEXT,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" DATETIME,
    CONSTRAINT "Payment_billCycleId_fkey" FOREIGN KEY ("billCycleId") REFERENCES "BillCycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Payment" ("amountOwed", "billCycleId", "id", "paid", "paidAt", "personId") SELECT "amountOwed", "billCycleId", "id", "paid", "paidAt", "personId" FROM "Payment";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";
CREATE UNIQUE INDEX "Payment_billCycleId_personId_key" ON "Payment"("billCycleId", "personId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
