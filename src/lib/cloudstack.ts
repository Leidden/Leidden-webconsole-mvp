import crypto from "node:crypto";

const apiUrl = process.env.CLOUDSTACK_API_URL;
const apiKey = process.env.CLOUDSTACK_API_KEY;
const secret = process.env.CLOUDSTACK_SECRET_KEY;

function ensureEnv() {
  if (!apiUrl || !apiKey || !secret) {
    throw new Error(
      "CLOUDSTACK_API_URL / CLOUDSTACK_API_KEY / CLOUDSTACK_SECRET_KEY must be set in .env.local"
    );
  }
}

export type CsParams = Record<string, string | number | boolean>;

function buildSignedUrl(command: string, params: CsParams): string {
  ensureEnv();
  const all: Record<string, string> = {
    response: "json",
    apikey: apiKey as string
  };
  for (const [k, v] of Object.entries(params)) all[k] = String(v);
  all.command = command;

  const sorted = Object.entries(all).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const qs = sorted
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  const signStr = sorted
    .map(
      ([k, v]) =>
        `${k.toLowerCase()}=${encodeURIComponent(v.toLowerCase())}`
    )
    .join("&");
  const signature = crypto
    .createHmac("sha1", secret as string)
    .update(signStr)
    .digest("base64");

  return `${apiUrl}?${qs}&signature=${encodeURIComponent(signature)}`;
}

export async function csCall<T = unknown>(
  command: string,
  params: CsParams = {}
): Promise<T> {
  const url = buildSignedUrl(command, params);
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `CloudStack ${command} HTTP ${res.status}: ${text.slice(0, 500)}`
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `CloudStack ${command} returned non-JSON body: ${text.slice(0, 200)}`
    );
  }
}

type AsyncJobResult = {
  queryasyncjobresultresponse?: {
    jobstatus?: number;
    jobresult?: unknown;
  };
};

export async function csWaitJob(
  jobid: string,
  timeoutMs = 600_000,
  pollMs = 2_000
): Promise<AsyncJobResult["queryasyncjobresultresponse"]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await csCall<AsyncJobResult>("queryAsyncJobResult", {
      jobid
    });
    const j = r.queryasyncjobresultresponse;
    if (j && (j.jobstatus === 1 || j.jobstatus === 2)) return j;
    await new Promise((res) => setTimeout(res, pollMs));
  }
  throw new Error(`CloudStack job ${jobid} timed out after ${timeoutMs}ms`);
}

export type Zone = {
  id: string;
  name: string;
  networktype: string;
  allocationstate: string;
};

type ListZonesResponse = {
  listzonesresponse?: {
    zone?: Zone[];
    count?: number;
  };
};

export async function listZones(): Promise<Zone[]> {
  const r = await csCall<ListZonesResponse>("listZones");
  return r.listzonesresponse?.zone ?? [];
}
