-- CreateTable
CREATE TABLE "PersonPhone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    CONSTRAINT "PersonPhone_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonPhone_phone_key" ON "PersonPhone"("phone");
