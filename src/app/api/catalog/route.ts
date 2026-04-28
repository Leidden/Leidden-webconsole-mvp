import { NextResponse } from "next/server";

import { requireUser, HttpError } from "@/lib/cs-user";
import {
  listFeaturedTemplates,
  listServiceOfferings,
  PRIMARY_ZONE_ID
} from "@/lib/cloudstack";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();

    const [templates, offerings] = await Promise.all([
      listFeaturedTemplates(PRIMARY_ZONE_ID),
      listServiceOfferings({
        account: user.csAccountName,
        domainid: user.csDomainId
      })
    ]);

    return NextResponse.json({
      templates: templates
        .filter((t) => t.hypervisor === "KVM")
        .map((t) => ({
          id: t.id,
          name: t.name,
          displayText: t.displaytext,
          osType: t.ostypename,
          hypervisor: t.hypervisor
        })),
      serviceOfferings: offerings.map((o) => ({
        id: o.id,
        name: o.name,
        displayText: o.displaytext,
        cpu: o.cpunumber,
        memoryMb: o.memory
      }))
    });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[GET /api/catalog] failed", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
