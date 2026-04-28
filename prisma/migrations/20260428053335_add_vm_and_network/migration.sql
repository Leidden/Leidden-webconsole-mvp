-- CreateTable
CREATE TABLE "UserNetwork" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "csNetworkId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cidr" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserNetwork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vm" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "csVmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "serviceOfferingId" TEXT NOT NULL,
    "sshKeyName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserNetwork_userId_key" ON "UserNetwork"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserNetwork_csNetworkId_key" ON "UserNetwork"("csNetworkId");

-- CreateIndex
CREATE UNIQUE INDEX "Vm_csVmId_key" ON "Vm"("csVmId");

-- CreateIndex
CREATE UNIQUE INDEX "Vm_userId_name_key" ON "Vm"("userId", "name");

-- AddForeignKey
ALTER TABLE "UserNetwork" ADD CONSTRAINT "UserNetwork_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vm" ADD CONSTRAINT "Vm_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
