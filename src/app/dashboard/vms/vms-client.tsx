"use client";

import { useEffect, useState, useTransition } from "react";

type Vm = {
  id: string;
  csVmId: string;
  name: string;
  state: string;
  ip: string | null;
  templateName: string | null;
  serviceOfferingName: string | null;
  sshKeyName: string | null;
  createdAt: string;
};

type Template = { id: string; name: string; displayText: string; osType?: string };
type Offering = {
  id: string; name: string; displayText: string; cpu?: number; memoryMb?: number;
};
type SshKey = { id: string; name: string };

export function VmsClient({
  initialVms,
  sshKeys
}: {
  initialVms: Vm[];
  sshKeys: SshKey[];
}) {
  const [vms, setVms] = useState<Vm[]>(initialVms);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // form state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [offeringId, setOfferingId] = useState("");
  const [sshKey, setSshKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!showForm) return;
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d) => {
        setTemplates(d.templates ?? []);
        setOfferings(d.serviceOfferings ?? []);
      })
      .catch(() => undefined);
  }, [showForm]);

  async function refresh() {
    const r = await fetch("/api/vms").catch(() => null);
    if (r?.ok) {
      const d = await r.json();
      setVms(d.vms ?? []);
    }
  }

  function deploy(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    fetch("/api/vms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        templateId,
        serviceOfferingId: offeringId,
        sshKeyName: sshKey || undefined
      })
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (data.error === "name_in_use") setError("A VM with that name already exists.");
          else if (data.error === "quota_exceeded")
            setError("VM quota reached for your account.");
          else if (data.error === "validation")
            setError("Invalid name (lowercase letters, digits, dash).");
          else setError(data.message || data.error || "Deploy failed.");
          return;
        }
        setShowForm(false);
        setName("");
        setTemplateId("");
        setOfferingId("");
        setSshKey("");
        await refresh();
      })
      .finally(() => setSubmitting(false));
  }

  function action(vm: Vm, act: "start" | "stop" | "reboot") {
    startTransition(async () => {
      setError(null);
      const r = await fetch(`/api/vms/${vm.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: act })
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.message || "Action failed.");
      }
      await refresh();
    });
  }

  function remove(vm: Vm) {
    if (!confirm(`Destroy VM ${vm.name}? This is irreversible.`)) return;
    startTransition(async () => {
      setError(null);
      const r = await fetch(`/api/vms/${vm.id}`, { method: "DELETE" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.message || "Delete failed.");
      }
      await refresh();
    });
  }

  function openConsole(vm: Vm) {
    fetch(`/api/vms/${vm.id}/console`, { method: "POST" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.url) {
          setError(d.message || "Console URL not available.");
          return;
        }
        window.open(d.url, "_blank", "noopener,noreferrer");
      });
  }

  const stateBadge = (state: string) => {
    const cls =
      state === "Running"
        ? "bg-green-100 text-green-800"
        : state === "Starting" || state === "Stopping"
          ? "bg-yellow-100 text-yellow-800"
          : state === "Stopped"
            ? "bg-gray-200 text-gray-700"
            : "bg-red-100 text-red-800";
    return (
      <span className={`text-xs rounded px-2 py-0.5 ${cls}`}>{state}</span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded border px-3 py-1.5 text-sm hover:bg-gray-100"
        >
          {showForm ? "Cancel" : "+ New virtual machine"}
        </button>
        <button
          onClick={refresh}
          disabled={pending}
          className="text-xs text-gray-600 underline disabled:opacity-60"
        >
          refresh
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={deploy}
          className="space-y-3 rounded border bg-white p-4 shadow-sm"
        >
          <h2 className="font-semibold text-sm">Create a new VM</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="my-vm-01"
                className="w-full rounded border px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Template</label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                required
                className="w-full rounded border px-2 py-1.5 text-sm"
              >
                <option value="">Select template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayText}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Size</label>
              <select
                value={offeringId}
                onChange={(e) => setOfferingId(e.target.value)}
                required
                className="w-full rounded border px-2 py-1.5 text-sm"
              >
                <option value="">Select size…</option>
                {offerings.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.displayText}
                    {o.cpu && o.memoryMb ? ` (${o.cpu} vCPU / ${o.memoryMb} MB)` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">SSH key (optional)</label>
              <select
                value={sshKey}
                onChange={(e) => setSshKey(e.target.value)}
                className="w-full rounded border px-2 py-1.5 text-sm"
              >
                <option value="">— none —</option>
                {sshKeys.map((k) => (
                  <option key={k.id} value={k.name}>
                    {k.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Deploy may take ~1–2 minutes (cloud-init bootstrap on first boot).
          </p>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-gray-900 text-white px-3 py-1 text-sm hover:bg-gray-800 disabled:opacity-60"
            >
              {submitting ? "Deploying…" : "Deploy"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </p>
      )}

      <div className="rounded border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">State</th>
              <th className="text-left px-3 py-2">IP</th>
              <th className="text-left px-3 py-2">Template</th>
              <th className="text-left px-3 py-2">Size</th>
              <th className="text-right px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {vms.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  No VMs yet. Click + New virtual machine to deploy one.
                </td>
              </tr>
            )}
            {vms.map((v) => {
              const running = v.state === "Running";
              const stopped = v.state === "Stopped";
              return (
                <tr key={v.csVmId} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{v.name}</td>
                  <td className="px-3 py-2">{stateBadge(v.state)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{v.ip ?? "-"}</td>
                  <td className="px-3 py-2 text-xs">{v.templateName ?? "-"}</td>
                  <td className="px-3 py-2 text-xs">{v.serviceOfferingName ?? "-"}</td>
                  <td className="px-3 py-2 text-right space-x-2">
                    <button
                      onClick={() => action(v, "start")}
                      disabled={running || pending}
                      className="text-xs hover:underline disabled:opacity-30"
                    >
                      start
                    </button>
                    <button
                      onClick={() => action(v, "stop")}
                      disabled={!running || pending}
                      className="text-xs hover:underline disabled:opacity-30"
                    >
                      stop
                    </button>
                    <button
                      onClick={() => action(v, "reboot")}
                      disabled={!running || pending}
                      className="text-xs hover:underline disabled:opacity-30"
                    >
                      reboot
                    </button>
                    <button
                      onClick={() => openConsole(v)}
                      disabled={!running || pending}
                      className="text-xs hover:underline disabled:opacity-30"
                    >
                      console
                    </button>
                    <button
                      onClick={() => remove(v)}
                      disabled={pending}
                      className="text-xs text-red-700 hover:underline disabled:opacity-30"
                    >
                      destroy
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
