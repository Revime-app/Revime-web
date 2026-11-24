-- CF5-15: Réparateur Home Notification Pill Dismissal.
-- Adds dashboardTodoSeenAt on Profile to track when the repairer last opened/inspected the Tableau de bord.

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN "dashboardTodoSeenAt" TIMESTAMP(3);
