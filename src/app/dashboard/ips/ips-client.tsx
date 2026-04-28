"use client";

import { useState, useTransition } from "react";

type Ip = {
  id: string;
  ipaddress: string;
  state: string;
  isSourceNat: boolean;
  isStaticNat: boolean;
  networkName: string | null;
  allocated: string | null;
};

export function IpsClient({ initialIps }: { initialIps: Ip[] }) {
  const [ips, setIps] = useState<Ip[]>(initialIps);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function refresh() {
    const r = await fetch("/api/ips").catch(() => null);
    if (r?.ok) {
      const d = await r.json();
      setIps(d.ips ?? []);
    }
  }

  function acquire() {
    setError(null);
    startTransition(async () => {
      const r = await fetch("/api/ips", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (d.error === "quota_exceeded") {
          setError("Public IP quota reached for your account.");
        } else {
          setError(d.message || d.error || "Acquire failed.");
        }
        return;
      }
      await refresh();
    });
  }

  function release(ip: Ip) {
    if (ip.isSourceNat) {
      setError("Source NAT IP cannot be released directly.");
      return;
    }
    if (!confirm(`Release IP ${ip.ipaddress}?`)) return;
    setError(null);
    startTransition(async () => {
      const r = await fetch(`/api/ips/${ip.id}`, { method: "DELETE" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.message || d.error || "Release failed.");
        return;
      }
      await refresh();
    });
  }

  const tag = (label: string, kind: "info" | "muted" = "muted") => (
    <span
      className={`text-xs rounded px-2 py-0.5 ${
        kind === "info"
          ? "bg-blue-100 text-blue-800"
          : "bg-gray-100 text-gray-700"
      }`}
    >
      {label}
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={acquire}
          disabled={pending}
          className="rounded border px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-60"
        >
          + Acquire new IP
        </button>
        <button
          onClick={refresh}
          disabled={pending}
          className="text-xs text-gray-600 underline disabled:opacity-60"
        >
          refresh
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </p>
      )}

      <div className="rounded border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2">IP</th>
              <th className="text-left px-3 py-2">Role</th>
              <th className="text-left px-3 py-2">Network</th>
              <th className="text-left px-3 py-2">Allocated</th>
              <th className="text-right px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {ips.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  No public IPs yet. Deploy a VM (which creates the default
                  network and Source NAT IP), or click + Acquire new IP above.
                </td>
              </tr>
            )}
            {ips.map((ip) => (
              <tr key={ip.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono">{ip.ipaddress}</td>
                <td className="px-3 py-2 space-x-1">
                  {ip.isSourceNat
                    ? tag("Source NAT", "info")
                    : tag("Allocated")}
                  {ip.isStaticNat && tag("Static NAT", "info")}
                </td>
                <td className="px-3 py-2 text-xs">{ip.networkName ?? "-"}</td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {ip.allocated ? new Date(ip.allocated).toLocaleString() : "-"}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => release(ip)}
                    disabled={ip.isSourceNat || pending}
                    className="text-xs text-red-700 hover:underline disabled:text-gray-400 disabled:no-underline"
                    title={
                      ip.isSourceNat
                        ? "Source NAT IP is bound to the default network"
                        : "Release this IP"
                    }
                  >
                    release
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
