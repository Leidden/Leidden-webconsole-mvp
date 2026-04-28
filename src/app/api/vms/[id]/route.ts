import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/cs-user";
import { csWaitJob, destroyVm, getVm } from "@/lib/cloudstack";

export const dynamic = "force-dynamic";

async function resolveVm(userId: string, idParam: string) {
  // accept either DB id or csVmId
  const row = await prisma.vm.findFirst({
    where: { userId, OR: [{ id: idParam }, { csVmId: idParam }] }
  });
  return row;
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();
    const row = await resolveVm(user.id, params.id);
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const cs = await getVm({
      id: row.csVmId,
      account: user.csAccountName,
      domainid: user.csDomainId
    });
    if (!cs) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json({
      vm: {
        id: row.id,
        csVmId: cs.id,
        name: cs.name,
        state: cs.state,
        hostname: cs.hostname ?? null,
        ip: cs.nic?.[0]?.ipaddress ?? null,
        templateName: cs.templatename ?? null,
        serviceOfferingName: cs.serviceofferingname ?? null,
        sshKeyName: row.sshKeyName,
        createdAt: row.createdAt.toISOString()
      }
    });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[GET /api/vms/:id] failed", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();
    const row = await resolveVm(user.id, params.id);
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

    try {
      const { jobid } = await destroyVm(row.csVmId, true);
      await csWaitJob(jobid, 300_000);
    } catch (e) {
      console.warn("[DELETE /api/vms/:id] CloudStack destroy failed; continuing", e);
    }

    await prisma.vm.delete({ where: { id: row.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[DELETE /api/vms/:id] failed", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
