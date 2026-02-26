-- CreateTable
CREATE TABLE "EnvVariableVersion" (
    "id" TEXT NOT NULL,
    "variableId" TEXT,
    "environmentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL,
    "operation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnvVariableVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnvVariableVersion_environmentId_key_createdAt_idx" ON "EnvVariableVersion"("environmentId", "key", "createdAt");

-- CreateIndex
CREATE INDEX "EnvVariableVersion_variableId_createdAt_idx" ON "EnvVariableVersion"("variableId", "createdAt");

-- AddForeignKey
ALTER TABLE "EnvVariableVersion" ADD CONSTRAINT "EnvVariableVersion_variableId_fkey" FOREIGN KEY ("variableId") REFERENCES "EnvVariable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
