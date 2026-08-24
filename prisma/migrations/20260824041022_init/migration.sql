-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "amount" REAL NOT NULL,
    "splitType" TEXT NOT NULL DEFAULT 'equal',
    "dueDay" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "customShare" REAL,
    CONSTRAINT "Membership_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Membership_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BillCycle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "totalAmount" REAL NOT NULL,
    "dueDate" DATETIME,
    "billFilePath" TEXT,
    "billFileName" TEXT,
    "extractedNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillCycle_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "billCycleId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "amountOwed" REAL NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" DATETIME,
    CONSTRAINT "Payment_billCycleId_fkey" FOREIGN KEY ("billCycleId") REFERENCES "BillCycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Membership_subscriptionId_personId_key" ON "Membership"("subscriptionId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "BillCycle_subscriptionId_periodLabel_key" ON "BillCycle"("subscriptionId", "periodLabel");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_billCycleId_personId_key" ON "Payment"("billCycleId", "personId");
