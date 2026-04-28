import { NextResponse } from "next/server";

import { requireUser, HttpError } from "@/lib/cs-user";
import { listAccountPublicIps, releasePublicIp } from "@/lib/cs-public-ip";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
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

  try {
    // Verify the IP belongs to this user and is not Source NAT.
    const ips = await listAccountPublicIps({
      account: user.csAccountName,
      domainid: user.csDomainId
    });
    const target = ips.find((ip) => ip.id === params.id);
    if (!target) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (target.issourcenat) {
      return NextResponse.json(
        { error: "source_nat_locked", message: "Source NAT IP is bound to your default network and cannot be released directly. Delete the network instead." },
        { status: 409 }
      );
    }
    await releasePublicIp(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[DELETE /api/ips/:id] failed", e);
    return NextResponse.json(
      { error: "release_failed", message: msg },
      { status: 500 }
    );
  }
}
