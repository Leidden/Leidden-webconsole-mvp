import { NextResponse } from "next/server";
import { listZones } from "@/lib/cloudstack";

export const dynamic = "force-dynamic";

export async function GET() {
  const time = new Date().toISOString();
  try {
    const zones = await listZones();
    return NextResponse.json({
      app: "ok",
      time,
      cloudstack: {
        connected: true,
        zoneCount: zones.length,
        zones: zones.map((z) => ({
          id: z.id,
          name: z.name,
          networktype: z.networktype,
          allocationstate: z.allocationstate
        }))
      }
    });
  } catch (e) {
    return NextResponse.json(
      {
        app: "ok",
        time,
        cloudstack: {
          connected: false,
          error: e instanceof Error ? e.message : String(e)
        }
      },
      { status: 200 }
    );
  }
}
