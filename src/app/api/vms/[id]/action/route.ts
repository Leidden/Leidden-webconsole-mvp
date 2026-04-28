import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/cs-user";
import { vmActionSchema } from "@/lib/zod-schemas";
import { csWaitJob, rebootVm, startVm, stopVm } from "@/lib/cloudstack";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const row = await prisma.vm.findFirst({
    where: { userId: user.id, OR: [{ id: params.id }, { csVmId: params.id }] }
  });
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = vmActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation" }, { status: 400 });
  }

  try {
    let jobid: string;
    if (parsed.data.action === "start") ({ jobid } = await startVm(row.csVmId));
    else if (parsed.data.action === "stop") ({ jobid } = await stopVm(row.csVmId, false));
    else ({ jobid } = await rebootVm(row.csVmId));
    const job = await csWaitJob(jobid, 300_000);
    if (job.jobstatus === 2) {
      const r = job.jobresult as { errortext?: string } | undefined;
      return NextResponse.json(
        { error: "action_failed", message: r?.errortext ?? "failed" },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/vms/:id/action] failed", e);
    return NextResponse.json({ error: "action_failed", message: msg }, { status: 500 });
  }
}
