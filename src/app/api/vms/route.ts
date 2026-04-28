import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/cs-user";
import { deployVmSchema } from "@/lib/zod-schemas";
import {
  csWaitJob,
  destroyVm,
  deployVm,
  listAccountVms
} from "@/lib/cloudstack";
import { ensureUserDefaultNetwork } from "@/lib/cs-customers";

export const dynamic = "force-dynamic";

type VmSummary = {
  id: string;
  csVmId: string;
  name: string;
  state: string;
  hostname: string | null;
  ip: string | null;
  templateName: string | null;
  serviceOfferingName: string | null;
  sshKeyName: string | null;
  createdAt: string;
};

export async function GET() {
  try {
    const user = await requireUser();
    const csVms = await listAccountVms({
      account: user.csAccountName,
      domainid: user.csDomainId
    });
    const dbVms = await prisma.vm.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        csVmId: true,
        name: true,
        sshKeyName: true,
        createdAt: true
      }
    });
    const dbByCsId = new Map(dbVms.map((v) => [v.csVmId, v]));

    const vms: VmSummary[] = csVms.map((cs) => {
      const db = dbByCsId.get(cs.id);
      return {
        id: db?.id ?? cs.id,
        csVmId: cs.id,
        name: cs.name,
        state: cs.state,
        hostname: cs.hostname ?? null,
        ip: cs.nic?.[0]?.ipaddress ?? null,
        templateName: cs.templatename ?? null,
        serviceOfferingName: cs.serviceofferingname ?? null,
        sshKeyName: db?.sshKeyName ?? cs.keypairs ?? null,
        createdAt: (db?.createdAt ?? new Date(cs.created ?? Date.now())).toISOString()
      };
    });
    return NextResponse.json({ vms });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[GET /api/vms] failed", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

async function safeDestroyCsVm(csVmId: string): Promise<void> {
  try {
    const { jobid } = await destroyVm(csVmId, true);
    // Don't block too long; just give CloudStack a chance to register the
    // teardown. If it stalls we still return early — caller already failed.
    await csWaitJob(jobid, 60_000, 3_000).catch(() => undefined);
  } catch (e) {
    console.warn(`[safeDestroyCsVm] cleanup of ${csVmId} failed:`, e);
  }
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = deployVmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { name, templateId, serviceOfferingId, sshKeyName } = parsed.data;

  // Reserve the (userId,name) row early so we can return 409 quickly.
  let placeholder;
  try {
    placeholder = await prisma.vm.create({
      data: {
        userId: user.id,
        csVmId: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        templateId,
        serviceOfferingId,
        sshKeyName: sshKeyName ?? null
      }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "name_in_use" }, { status: 409 });
    }
    throw e;
  }

  let createdCsVmId: string | null = null;

  try {
    const network = await ensureUserDefaultNetwork({
      userId: user.id,
      account: user.csAccountName,
      domainid: user.csDomainId
    });

    const { id: csVmId, jobid } = await deployVm({
      account: user.csAccountName,
      domainid: user.csDomainId,
      serviceofferingid: serviceOfferingId,
      templateid: templateId,
      networkid: network.csNetworkId,
      name,
      keypair: sshKeyName
    });
    createdCsVmId = csVmId;

    // Update placeholder with real csVmId so a later list shows it as
    // Starting even if the wait below times out.
    await prisma.vm.update({
      where: { id: placeholder.id },
      data: { csVmId }
    });

    const job = await csWaitJob(jobid, 600_000, 3_000);
    if (job.jobstatus === 2) {
      const result = job.jobresult as { errortext?: string } | undefined;
      const msg = result?.errortext ?? "deploy failed";
      // CloudStack may have created a half-baked VM record even on async fail.
      await safeDestroyCsVm(csVmId);
      await prisma.vm.delete({ where: { id: placeholder.id } });
      const lower = msg.toLowerCase();
      if (lower.includes("resource limit") || lower.includes("exceed")) {
        return NextResponse.json(
          { error: "quota_exceeded", message: msg },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "deploy_failed", message: msg },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, vm: { id: placeholder.id, csVmId } });
  } catch (e) {
    if (createdCsVmId) {
      await safeDestroyCsVm(createdCsVmId);
    }
    await prisma.vm
      .delete({ where: { id: placeholder.id } })
      .catch(() => undefined);
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg.toLowerCase().includes("resource limit") ||
      msg.toLowerCase().includes("exceed")
    ) {
      return NextResponse.json({ error: "quota_exceeded", message: msg }, { status: 409 });
    }
    console.error("[POST /api/vms] failed", e);
    return NextResponse.json({ error: "deploy_failed", message: msg }, { status: 500 });
  }
}
