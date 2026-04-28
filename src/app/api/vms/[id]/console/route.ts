import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/cs-user";
import { createConsoleEndpoint } from "@/lib/cloudstack";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();
    const row = await prisma.vm.findFirst({
      where: { userId: user.id, OR: [{ id: params.id }, { csVmId: params.id }] }
    });
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const ep = await createConsoleEndpoint({ vmid: row.csVmId });
    return NextResponse.json({ url: ep.url });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/vms/:id/console] failed", e);
    return NextResponse.json({ error: "console_failed", message: msg }, { status: 500 });
  }
}
