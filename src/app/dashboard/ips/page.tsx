import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { listAccountPublicIps } from "@/lib/cs-public-ip";
import { getAccountUsage } from "@/lib/cs-usage";
import { IpsClient } from "./ips-client";

export const dynamic = "force-dynamic";

export default async function PublicIpsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { csAccountName: true, csDomainId: true }
  });
  if (!me) redirect("/login");

  const [csIps, usage] = await Promise.all([
    listAccountPublicIps({ account: me.csAccountName, domainid: me.csDomainId }).catch(() => []),
    getAccountUsage({ account: me.csAccountName, domainid: me.csDomainId }).catch(() => null)
  ]);

  const initialIps = csIps.map((ip) => ({
    id: ip.id,
    ipaddress: ip.ipaddress,
    state: ip.state,
    isSourceNat: ip.issourcenat ?? false,
    isStaticNat: ip.isstaticnat ?? false,
    networkName: ip.associatednetworkname ?? null,
    allocated: ip.allocated ?? null
  }));

  const ipUsage = usage?.find((u) => u.type === "public_ip") ?? null;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Public IPs</h1>
          <p className="text-sm text-gray-600 mt-1">
            Each user gets one Source NAT IP automatically when their first VM
            is deployed (used as the outbound NAT for all VMs in the default
            network). You can acquire additional IPs from the pool here.
          </p>
          {ipUsage && (
            <p className="text-xs text-gray-700 mt-2">
              IP usage:{" "}
              <span className="font-mono">
                {ipUsage.current} / {ipUsage.max < 0 ? "∞" : ipUsage.max}
              </span>
            </p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Inbound exposure (StaticNAT / Port Forwarding) is intentionally not
            wired in this stage.
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-blue-700 underline">
          ← Back to dashboard
        </Link>
      </header>

      <IpsClient initialIps={initialIps} />
    </main>
  );
}
