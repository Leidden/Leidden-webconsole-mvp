import { listZones } from "@/lib/cloudstack";

export const dynamic = "force-dynamic";

type ZoneSummary = {
  id: string;
  name: string;
  networktype: string;
  allocationstate: string;
};

async function getStatus() {
  const status: {
    app: string;
    time: string;
    cloudstack:
      | { connected: true; zoneCount: number; zones: ZoneSummary[] }
      | { connected: false; error: string };
  } = {
    app: "ok",
    time: new Date().toISOString(),
    cloudstack: { connected: false, error: "not yet checked" }
  };

  try {
    const zones = await listZones();
    status.cloudstack = {
      connected: true,
      zoneCount: zones.length,
      zones: zones.map((z) => ({
        id: z.id,
        name: z.name,
        networktype: z.networktype,
        allocationstate: z.allocationstate
      }))
    };
  } catch (e) {
    status.cloudstack = {
      connected: false,
      error: e instanceof Error ? e.message : String(e)
    };
  }

  return status;
}

export default async function Home() {
  const status = await getStatus();
  const csConnected = status.cloudstack.connected;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Web Console MVP</h1>
        <p className="text-sm text-gray-600 mt-2">
          CloudStack self-service portal — skeleton stage
        </p>
      </header>

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">System status</h2>
          <span
            className={`text-xs px-2 py-1 rounded ${
              csConnected
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {csConnected ? "CloudStack connected" : "CloudStack disconnected"}
          </span>
        </div>

        <pre className="text-xs overflow-auto rounded bg-gray-50 p-3 border">
          {JSON.stringify(status, null, 2)}
        </pre>

        <p className="text-xs text-gray-500 mt-4">
          Next stages: auth, SSH key management, VM lifecycle. See
          webconsole-mvp-design.md.
        </p>
      </section>
    </main>
  );
}
