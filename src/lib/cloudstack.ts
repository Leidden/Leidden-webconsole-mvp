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

  const sorted = Object.entries(all).sort(([a], [b]) => a.localeCompare(b));
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
): Promise<NonNullable<AsyncJobResult["queryasyncjobresultresponse"]>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await csCall<AsyncJobResult>("queryAsyncJobResult", { jobid });
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
  listzonesresponse?: { zone?: Zone[]; count?: number };
};

export async function listZones(): Promise<Zone[]> {
  const r = await csCall<ListZonesResponse>("listZones");
  return r.listzonesresponse?.zone ?? [];
}

export type CsAccount = {
  id: string;
  name: string;
  accounttype: number;
  state: string;
  domain: string;
  domainid: string;
};

type CreateAccountResponse = {
  createaccountresponse?: { account?: CsAccount };
};

export async function createCsAccount(args: {
  account: string;
  domainid: string;
  username: string;
  password: string;
  email: string;
  firstname: string;
  lastname: string;
}): Promise<CsAccount> {
  const r = await csCall<CreateAccountResponse>("createAccount", {
    accounttype: "0",
    domainid: args.domainid,
    username: args.username,
    password: args.password,
    firstname: args.firstname,
    lastname: args.lastname,
    email: args.email,
    account: args.account
  });
  const acct = r.createaccountresponse?.account;
  if (!acct) throw new Error("createAccount returned no account");
  return acct;
}

export async function setResourceLimit(args: {
  account: string;
  domainid: string;
  resourcetype: string;
  max: string;
}): Promise<void> {
  await csCall("updateResourceLimit", {
    account: args.account,
    domainid: args.domainid,
    resourcetype: args.resourcetype,
    max: args.max
  });
}

export async function deleteCsAccount(id: string): Promise<void> {
  const r = await csCall<{ deleteaccountresponse?: { jobid?: string } }>(
    "deleteAccount",
    { id }
  );
  const jobid = r.deleteaccountresponse?.jobid;
  if (jobid) await csWaitJob(jobid);
}

// ──────────────────────────────────────────────────────────
// SSH key pair (per Account)
// ──────────────────────────────────────────────────────────

export type CsSshKeyPair = {
  id?: string;
  name: string;
  fingerprint: string;
  account?: string;
  domain?: string;
  domainid?: string;
};

export type CsSshKeyPairWithPrivate = CsSshKeyPair & {
  privatekey: string;
};

type RegisterSshKeyPairResponse = {
  registersshkeypairresponse?: { keypair?: CsSshKeyPair };
};
type CreateSshKeyPairResponse = {
  createsshkeypairresponse?: { keypair?: CsSshKeyPairWithPrivate };
};
type ListSshKeyPairsResponse = {
  listsshkeypairsresponse?: { sshkeypair?: CsSshKeyPair[]; count?: number };
};
type DeleteSshKeyPairResponse = {
  deletesshkeypairresponse?: { success?: boolean | string };
};

export async function registerCsSshKey(args: {
  account: string;
  domainid: string;
  name: string;
  publickey: string;
}): Promise<CsSshKeyPair> {
  const r = await csCall<RegisterSshKeyPairResponse>("registerSSHKeyPair", {
    account: args.account,
    domainid: args.domainid,
    name: args.name,
    publickey: args.publickey
  });
  const kp = r.registersshkeypairresponse?.keypair;
  if (!kp) throw new Error("registerSSHKeyPair returned no keypair");
  return kp;
}

export async function createCsSshKey(args: {
  account: string;
  domainid: string;
  name: string;
}): Promise<CsSshKeyPairWithPrivate> {
  const r = await csCall<CreateSshKeyPairResponse>("createSSHKeyPair", {
    account: args.account,
    domainid: args.domainid,
    name: args.name
  });
  const kp = r.createsshkeypairresponse?.keypair;
  if (!kp || !kp.privatekey) {
    throw new Error("createSSHKeyPair returned no private key");
  }
  return kp;
}

export async function deleteCsSshKey(args: {
  account: string;
  domainid: string;
  name: string;
}): Promise<boolean> {
  const r = await csCall<DeleteSshKeyPairResponse>("deleteSSHKeyPair", {
    account: args.account,
    domainid: args.domainid,
    name: args.name
  });
  const ok = r.deletesshkeypairresponse?.success;
  return ok === true || ok === "true";
}

export async function listCsSshKeys(args: {
  account: string;
  domainid: string;
}): Promise<CsSshKeyPair[]> {
  const r = await csCall<ListSshKeyPairsResponse>("listSSHKeyPairs", {
    account: args.account,
    domainid: args.domainid,
    listall: "true"
  });
  return r.listsshkeypairsresponse?.sshkeypair ?? [];
}
