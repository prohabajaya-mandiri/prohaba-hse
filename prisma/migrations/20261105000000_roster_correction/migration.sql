-- AlterTable
ALTER TABLE "Placement" ADD COLUMN     "rosterPolicyId" TEXT,
ADD COLUMN     "rosterStart" TIMESTAMP(3),
ADD COLUMN     "rosterStartAt" TIMESTAMP(3);
