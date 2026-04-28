import { NextResponse } from "next/server";

import { requireUser, HttpError } from "@/lib/cs-user";
import {
  acquireIpForNetwork,
  listAccountPublicIps
} from "@/lib/cs-public-ip";
import { ensureUserDefaultNetwork } from "@/lib/cs-customers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const ips = await listAccountPublicIps({
      account: user.csAccountName,
      domainid: user.csDomainId
    });
    return NextResponse.json({
      ips: ips.map((ip) => ({
        id: ip.id,
        ipaddress: ip.ipaddress,
        state: ip.state,
        isSourceNat: ip.issourcenat ?? false,
        isStaticNat: ip.isstaticnat ?? false,
        networkId: ip.associatednetworkid ?? null,
        networkName: ip.associatednetworkname ?? null,
        allocated: ip.allocated ?? null
      }))
    });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[GET /api/ips] failed", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST() {
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
    const network = await ensureUserDefaultNetwork({
      userId: user.id,
      account: user.csAccountName,
      domainid: user.csDomainId
    });

    const ip = await acquireIpForNetwork({
      account: user.csAccountName,
      domainid: user.csDomainId,
      networkid: network.csNetworkId
    });

    return NextResponse.json({
      ok: true,
      ip: {
        id: ip.id,
        ipaddress: ip.ipaddress,
        state: ip.state,
        isSourceNat: ip.issourcenat ?? false,
        isStaticNat: ip.isstaticnat ?? false,
        networkId: ip.associatednetworkid ?? null,
        networkName: ip.associatednetworkname ?? null
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const lower = msg.toLowerCase();
    if (lower.includes("resource limit") || lower.includes("exceed")) {
      return NextResponse.json(
        { error: "quota_exceeded", message: msg },
        { status: 409 }
      );
    }
    console.error("[POST /api/ips] failed", e);
    return NextResponse.json(
      { error: "acquire_failed", message: msg },
      { status: 500 }
    );
  }
}
