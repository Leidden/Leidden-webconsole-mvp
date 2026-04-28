import { NextResponse } from "next/server";

import { requireUser, HttpError } from "@/lib/cs-user";
import { getAccountUsage } from "@/lib/cs-usage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const items = await getAccountUsage({
      account: user.csAccountName,
      domainid: user.csDomainId
    });
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[GET /api/usage] failed", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
