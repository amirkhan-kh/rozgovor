-- AlterTable
ALTER TABLE "Manager" ADD COLUMN     "canViewAll" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canViewDashboard" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "canViewRating" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "password" TEXT,
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'sotuvchi';
