import { getAccountUsage, type UsageItem } from "@/lib/cs-usage";

function Bar({ item }: { item: UsageItem }) {
  const unlimited = item.max < 0;
  const max = unlimited ? Math.max(item.current, 1) : item.max;
  const pct = unlimited ? 0 : Math.min(100, (item.current / max) * 100);
  const nearFull = !unlimited && item.current / item.max >= 0.8;
  const full = !unlimited && item.current >= item.max;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-700">{item.label}</span>
        <span className={full ? "text-red-700 font-medium" : nearFull ? "text-amber-700" : "text-gray-600"}>
          {item.current}
          {" / "}
          {unlimited ? "∞" : item.max}
        </span>
      </div>
      <div className="h-1.5 rounded bg-gray-200 overflow-hidden">
        <div
          className={
            full
              ? "h-full bg-red-500"
              : nearFull
                ? "h-full bg-amber-500"
                : "h-full bg-gray-700"
          }
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export async function UsageCard({
  account,
  domainid
}: {
  account: string;
  domainid: string;
}) {
  let items: UsageItem[];
  try {
    items = await getAccountUsage({ account, domainid });
  } catch (e) {
    return (
      <div className="rounded-lg border bg-white p-4 shadow-sm text-sm text-red-700">
        Failed to load usage: {e instanceof Error ? e.message : String(e)}
      </div>
    );
  }
  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm space-y-3">
      <h2 className="font-semibold text-sm">Quota usage</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {items.map((it) => (
          <Bar key={it.type} item={it} />
        ))}
      </div>
      <p className="text-xs text-gray-500">
        Reach a limit?{" "}
        <span className="text-gray-600">
          The deploy/upload form will return a clear quota error.
        </span>
      </p>
    </section>
  );
}
