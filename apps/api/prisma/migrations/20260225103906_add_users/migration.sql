-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- Insert demo user (password: demo123)
INSERT INTO "User" ("id", "email", "passwordHash", "name", "createdAt", "updatedAt") 
VALUES (
    'demo-user-id',
    'demo@envault.local',
    '$2a$10$N9qo8uLOickgx2ZMRZoMye.IjqQBrkHx7WlH5sX5O6dLkJ7Hm.YaG',
    'Demo User',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- AlterTable (add userId first without NOT NULL constraint)
ALTER TABLE "Project" ADD COLUMN "userId" TEXT;

-- Update existing projects to belong to demo user
UPDATE "Project" SET "userId" = 'demo-user-id' WHERE "userId" IS NULL;

-- Now make it NOT NULL
ALTER TABLE "Project" ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "userId" TEXT;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
