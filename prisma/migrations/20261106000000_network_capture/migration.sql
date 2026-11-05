ALTER TABLE "Contact" ADD COLUMN "canonicalProfileUrl" TEXT,
  ADD COLUMN "relationshipStrength" TEXT,
  ADD COLUMN "tags" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "lastVerifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Contact_createdBy_canonicalProfileUrl_key" ON "Contact"("createdBy", "canonicalProfileUrl");

CREATE TABLE "Opportunity" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "companyId" TEXT NOT NULL, "jobId" TEXT,
  "title" TEXT NOT NULL, "source" TEXT, "stage" TEXT NOT NULL DEFAULT 'research', "priority" INTEGER NOT NULL DEFAULT 3,
  "fitNotes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Opportunity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Opportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Opportunity_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Opportunity_userId_idx" ON "Opportunity"("userId");
CREATE TABLE "ContactEmployment" (
  "id" TEXT NOT NULL PRIMARY KEY, "contactId" TEXT NOT NULL, "companyId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT '', "startDate" TEXT, "endDate" TEXT, "current" BOOLEAN NOT NULL DEFAULT false,
  "source" TEXT NOT NULL, "capturedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContactEmployment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContactEmployment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ContactEmployment_contactId_companyId_role_key" ON "ContactEmployment"("contactId", "companyId", "role");
CREATE TABLE "PersonRelationship" (
  "id" TEXT NOT NULL PRIMARY KEY, "fromId" TEXT NOT NULL, "toId" TEXT NOT NULL, "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'suggested', "evidence" TEXT, "notes" TEXT, "verifiedAt" TIMESTAMP(3),
  CONSTRAINT "PersonRelationship_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PersonRelationship_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PersonRelationship_fromId_toId_type_key" ON "PersonRelationship"("fromId", "toId", "type");
CREATE TABLE "OpportunityContact" (
  "id" TEXT NOT NULL PRIMARY KEY, "opportunityId" TEXT NOT NULL, "contactId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'contact', "status" TEXT NOT NULL DEFAULT 'suspected',
  CONSTRAINT "OpportunityContact_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OpportunityContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OpportunityContact_opportunityId_contactId_role_key" ON "OpportunityContact"("opportunityId", "contactId", "role");
ALTER TABLE "Task" ADD COLUMN "contactId" TEXT, ADD COLUMN "opportunityId" TEXT,
  ADD CONSTRAINT "Task_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Task_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD COLUMN "contactId" TEXT, ADD COLUMN "opportunityId" TEXT, ADD COLUMN "channel" TEXT, ADD COLUMN "outcome" TEXT,
  ADD CONSTRAINT "Activity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Activity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "CaptureEvent" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "requestId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL, "sourceUrl" TEXT NOT NULL, "method" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL, "warnings" TEXT NOT NULL, "result" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaptureEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CaptureEvent_userId_requestId_key" ON "CaptureEvent"("userId", "requestId");
