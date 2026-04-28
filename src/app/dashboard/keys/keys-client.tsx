"use client";

import { useState, useTransition } from "react";

type Key = {
  id: string;
  name: string;
  fingerprint: string;
  source: "uploaded" | "generated";
  createdAt: string;
};

export function KeysClient({ initialKeys }: { initialKeys: Key[] }) {
  const [keys, setKeys] = useState<Key[]>(initialKeys);
  const [mode, setMode] = useState<"none" | "upload" | "generate">("none");
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<{
    name: string;
    privateKey: string;
  } | null>(null);

  // upload form state
  const [upName, setUpName] = useState("");
  const [upPublicKey, setUpPublicKey] = useState("");
  // generate form state
  const [genName, setGenName] = useState("");

  const [pending, startTransition] = useTransition();

  function reset() {
    setMode("none");
    setError(null);
    setUpName("");
    setUpPublicKey("");
    setGenName("");
  }

  function uploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: upName, publicKey: upPublicKey })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(formatError(data));
        return;
      }
      setKeys((cur) => [data.key as Key, ...cur]);
      reset();
    });
  }

  function generateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/keys/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: genName })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(formatError(data));
        return;
      }
      setKeys((cur) => [data.key as Key, ...cur]);
      setGenerated({
        name: (data.key as Key).name,
        privateKey: data.privateKey as string
      });
      reset();
    });
  }

  function deleteKey(id: string) {
    if (!confirm("Delete this key? It will also be removed from CloudStack."))
      return;
    startTransition(async () => {
      const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(formatError(data));
        return;
      }
      setKeys((cur) => cur.filter((k) => k.id !== id));
    });
  }

  function downloadPem() {
    if (!generated) return;
    const blob = new Blob([generated.privateKey], { type: "application/x-pem-file" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${generated.name}.pem`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <button
          className="rounded border px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-60"
          onClick={() => setMode("upload")}
          disabled={pending}
        >
          + Upload public key
        </button>
        <button
          className="rounded border px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-60"
          onClick={() => setMode("generate")}
          disabled={pending}
        >
          + Generate new key
        </button>
      </div>

      {mode === "upload" && (
        <form
          onSubmit={uploadSubmit}
          className="space-y-3 rounded border bg-white p-4 shadow-sm"
        >
          <h2 className="font-semibold text-sm">Upload public key</h2>
          <div>
            <label className="block text-xs font-medium mb-1">Key name</label>
            <input
              type="text"
              value={upName}
              onChange={(e) => setUpName(e.target.value)}
              required
              maxLength={40}
              className="w-full rounded border px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Public key (ssh-ed25519 / ssh-rsa / ...)
            </label>
            <textarea
              value={upPublicKey}
              onChange={(e) => setUpPublicKey(e.target.value)}
              required
              rows={3}
              className="w-full rounded border px-2 py-1.5 text-xs font-mono"
              placeholder="ssh-ed25519 AAAA..."
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={reset}
              className="rounded border px-3 py-1 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-gray-900 text-white px-3 py-1 text-sm hover:bg-gray-800 disabled:opacity-60"
            >
              {pending ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>
      )}

      {mode === "generate" && (
        <form
          onSubmit={generateSubmit}
          className="space-y-3 rounded border bg-white p-4 shadow-sm"
        >
          <h2 className="font-semibold text-sm">Generate new key pair</h2>
          <p className="text-xs text-gray-600">
            CloudStack will generate a new RSA 2048-bit key pair. The private
            key will be shown <strong>once</strong>; back it up before closing
            the dialog.
          </p>
          <div>
            <label className="block text-xs font-medium mb-1">Key name</label>
            <input
              type="text"
              value={genName}
              onChange={(e) => setGenName(e.target.value)}
              required
              maxLength={40}
              className="w-full rounded border px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={reset}
              className="rounded border px-3 py-1 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-gray-900 text-white px-3 py-1 text-sm hover:bg-gray-800 disabled:opacity-60"
            >
              {pending ? "Generating..." : "Generate"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </p>
      )}

      {generated && (
        <div className="rounded border-2 border-yellow-400 bg-yellow-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-yellow-900">
              Private key for {generated.name} (shown once)
            </h2>
            <button
              onClick={() => setGenerated(null)}
              className="text-xs underline text-yellow-900"
            >
              dismiss
            </button>
          </div>
          <p className="text-xs text-yellow-900">
            Save this immediately. We do not store the private key — if you
            lose it you will have to delete the key and create a new one.
          </p>
          <textarea
            readOnly
            value={generated.privateKey}
            rows={10}
            className="w-full rounded border px-2 py-1.5 text-xs font-mono bg-white"
          />
          <div className="flex gap-2">
            <button
              onClick={downloadPem}
              className="rounded bg-yellow-700 text-white px-3 py-1 text-sm hover:bg-yellow-800"
            >
              Download .pem
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(generated.privateKey)}
              className="rounded border px-3 py-1 text-sm"
            >
              Copy to clipboard
            </button>
          </div>
        </div>
      )}

      <div className="rounded border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Fingerprint</th>
              <th className="text-left px-3 py-2">Source</th>
              <th className="text-left px-3 py-2">Added</th>
              <th className="text-right px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  No SSH keys yet. Upload or generate one to get started.
                </td>
              </tr>
            )}
            {keys.map((k) => (
              <tr key={k.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{k.name}</td>
                <td className="px-3 py-2 font-mono text-xs">{k.fingerprint}</td>
                <td className="px-3 py-2">
                  <span
                    className={`text-xs rounded px-2 py-0.5 ${
                      k.source === "generated"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {k.source}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {new Date(k.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => deleteKey(k.id)}
                    disabled={pending}
                    className="text-xs text-red-700 hover:underline disabled:opacity-60"
                  >
                    delete
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

function formatError(data: { error?: string; message?: string }): string {
  if (data.error === "name_in_use") return "A key with that name already exists.";
  if (data.error === "key_limit_reached") return "You have reached the key limit (5).";
  if (data.error === "validation") return "Invalid name or public key.";
  if (data.error === "unauthorized") return "Please sign in again.";
  return data.message || data.error || "Operation failed.";
}
