import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { listAccountVms } from "@/lib/cloudstack";
import { getAccountUsage } from "@/lib/cs-usage";
import { VmsClient } from "./vms-client";

export const dynamic = "force-dynamic";

export default async function VmsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { csAccountName: true, csDomainId: true }
  });
  if (!me) redirect("/login");

  const [csVms, dbVms, sshKeys, usage] = await Promise.all([
    listAccountVms({ account: me.csAccountName, domainid: me.csDomainId }).catch(() => []),
    prisma.vm.findMany({ where: { userId: session.user.id } }),
    prisma.sshKey.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true }
    }),
    getAccountUsage({
      account: me.csAccountName,
      domainid: me.csDomainId
    }).catch(() => null)
  ]);

  const dbByCsId = new Map(dbVms.map((v) => [v.csVmId, v]));
  const initialVms = csVms.map((cs) => {
    const db = dbByCsId.get(cs.id);
    return {
      id: db?.id ?? cs.id,
      csVmId: cs.id,
      name: cs.name,
      state: cs.state,
      ip: cs.nic?.[0]?.ipaddress ?? null,
      templateName: cs.templatename ?? null,
      serviceOfferingName: cs.serviceofferingname ?? null,
      sshKeyName: db?.sshKeyName ?? cs.keypairs ?? null,
      createdAt: (db?.createdAt ?? new Date(cs.created ?? Date.now())).toISOString()
    };
  });

  const vmUsage = usage?.find((u) => u.type === "user_vm") ?? null;

  return (
    <main className="mx-auto max-w-5xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Virtual machines</h1>
          <p className="text-sm text-gray-600 mt-1">
            Each new instance is attached to your default Isolated VXLAN
            network (auto-created on first deploy).
          </p>
          {vmUsage && (
            <p className="text-xs text-gray-700 mt-2">
              VM usage:{" "}
              <span className="font-mono">
                {vmUsage.current} / {vmUsage.max < 0 ? "∞" : vmUsage.max}
              </span>
            </p>
          )}
        </div>
        <Link href="/dashboard" className="text-sm text-blue-700 underline">
          ← Back to dashboard
        </Link>
      </header>

      <VmsClient initialVms={initialVms} sshKeys={sshKeys} />
    </main>
  );
}
