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

// CloudStack accepts standard URL-encoded values (space -> %20). The
// signing string is the URL-encoded query string lowercased as a whole —
// crucially we encode FIRST and lowercase AFTER, so %2B (a literal '+'
// in the value) becomes %2b, matching CloudStack's server-side check.
function csEncode(value: string): string {
  return encodeURIComponent(value);
}

function buildSignedUrl(command: string, params: CsParams): string {
  ensureEnv();
  const all: Record<string, string> = {
    response: "json",
    apikey: apiKey as string
  };
  for (const [k, v] of Object.entries(params)) all[k] = String(v);
  all.command = command;

  const sorted = Object.entries(all).sort(([a], [b]) => a.localeCompare(b));
  // URL string we actually send. CloudStack URL-decodes it, then re-encodes
  // Java-style for signature verification — so we must produce the same
  // Java-style encoded string for signing below.
  const qs = sorted
    .map(([k, v]) => `${k}=${csEncode(v)}`)
    .join("&");
  // Signing string: Java URLEncoder + lowercase the whole thing.
  const signStr = qs.toLowerCase();
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

// ──────────────────────────────────────────────────────────
// Zones
// ──────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────
// Account / domain / quota
// ──────────────────────────────────────────────────────────

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

export type CsSshKeyPairWithPrivate = CsSshKeyPair & { privatekey: string };

type RegisterSshKeyPairResponse = { registersshkeypairresponse?: { keypair?: CsSshKeyPair } };
type CreateSshKeyPairResponse = { createsshkeypairresponse?: { keypair?: CsSshKeyPairWithPrivate } };
type ListSshKeyPairsResponse = { listsshkeypairsresponse?: { sshkeypair?: CsSshKeyPair[] } };
type DeleteSshKeyPairResponse = { deletesshkeypairresponse?: { success?: boolean | string } };

export async function registerCsSshKey(args: {
  account: string; domainid: string; name: string; publickey: string;
}): Promise<CsSshKeyPair> {
  const r = await csCall<RegisterSshKeyPairResponse>("registerSSHKeyPair", {
    account: args.account, domainid: args.domainid, name: args.name, publickey: args.publickey
  });
  const kp = r.registersshkeypairresponse?.keypair;
  if (!kp) throw new Error("registerSSHKeyPair returned no keypair");
  return kp;
}

export async function createCsSshKey(args: {
  account: string; domainid: string; name: string;
}): Promise<CsSshKeyPairWithPrivate> {
  const r = await csCall<CreateSshKeyPairResponse>("createSSHKeyPair", {
    account: args.account, domainid: args.domainid, name: args.name
  });
  const kp = r.createsshkeypairresponse?.keypair;
  if (!kp || !kp.privatekey) throw new Error("createSSHKeyPair returned no private key");
  return kp;
}

export async function deleteCsSshKey(args: {
  account: string; domainid: string; name: string;
}): Promise<boolean> {
  const r = await csCall<DeleteSshKeyPairResponse>("deleteSSHKeyPair", {
    account: args.account, domainid: args.domainid, name: args.name
  });
  const ok = r.deletesshkeypairresponse?.success;
  return ok === true || ok === "true";
}

export async function listCsSshKeys(args: { account: string; domainid: string }): Promise<CsSshKeyPair[]> {
  const r = await csCall<ListSshKeyPairsResponse>("listSSHKeyPairs", {
    account: args.account, domainid: args.domainid, listall: "true"
  });
  return r.listsshkeypairsresponse?.sshkeypair ?? [];
}

// ──────────────────────────────────────────────────────────
// Catalog: templates / service offerings / zones
// ──────────────────────────────────────────────────────────

export type CsTemplate = {
  id: string;
  name: string;
  displaytext: string;
  ostypename?: string;
  hypervisor: string;
  size?: number;
  isready?: boolean;
  ispublic?: boolean;
  isfeatured?: boolean;
  passwordenabled?: boolean;
};

type ListTemplatesResponse = { listtemplatesresponse?: { template?: CsTemplate[] } };

export async function listFeaturedTemplates(zoneid: string): Promise<CsTemplate[]> {
  const r = await csCall<ListTemplatesResponse>("listTemplates", {
    templatefilter: "featured",
    zoneid,
    listall: "true"
  });
  return (r.listtemplatesresponse?.template ?? []).filter((t) => t.isready);
}

export type CsServiceOffering = {
  id: string;
  name: string;
  displaytext: string;
  cpunumber?: number;
  cpuspeed?: number;
  memory?: number;
  iscustomized?: boolean;
};

type ListServiceOfferingsResponse = {
  listserviceofferingsresponse?: { serviceoffering?: CsServiceOffering[] };
};

export async function listServiceOfferings(args: {
  account: string; domainid: string;
}): Promise<CsServiceOffering[]> {
  const r = await csCall<ListServiceOfferingsResponse>("listServiceOfferings", {
    account: args.account,
    domainid: args.domainid
  });
  return (r.listserviceofferingsresponse?.serviceoffering ?? []).filter(
    (s) => !s.iscustomized
  );
}

// ──────────────────────────────────────────────────────────
// Networks
// ──────────────────────────────────────────────────────────

export type CsNetwork = {
  id: string;
  name: string;
  cidr?: string;
  gateway?: string;
  state: string;
  type: string;
  broadcastdomaintype?: string;
  broadcasturi?: string;
  account?: string;
  domainid?: string;
};

type CreateNetworkResponse = { createnetworkresponse?: { network?: CsNetwork } };
type ListNetworksResponse = { listnetworksresponse?: { network?: CsNetwork[] } };
type DeleteNetworkResponse = { deletenetworkresponse?: { jobid?: string } };

const DEFAULT_NETWORK_OFFERING_ID =
  "33dffc8a-590f-42e5-8a77-087ebaa13a7d"; // DefaultIsolatedNetworkOfferingWithSourceNatService

const DEFAULT_ZONE_ID = "11b4bc2a-02ac-4aa4-992e-a26695b326f5"; // zone-01

export const PRIMARY_ZONE_ID = DEFAULT_ZONE_ID;

export async function createUserIsolatedNetwork(args: {
  account: string;
  domainid: string;
  name: string;
  gateway: string;
  netmask: string;
}): Promise<CsNetwork> {
  const r = await csCall<CreateNetworkResponse>("createNetwork", {
    account: args.account,
    domainid: args.domainid,
    name: args.name,
    displaytext: args.name,
    networkofferingid: DEFAULT_NETWORK_OFFERING_ID,
    zoneid: DEFAULT_ZONE_ID,
    gateway: args.gateway,
    netmask: args.netmask
  });
  const net = r.createnetworkresponse?.network;
  if (!net) throw new Error("createNetwork returned no network");
  return net;
}

export async function deleteUserNetwork(id: string): Promise<void> {
  const r = await csCall<DeleteNetworkResponse>("deleteNetwork", { id });
  const jobid = r.deletenetworkresponse?.jobid;
  if (jobid) await csWaitJob(jobid);
}

export async function listAccountNetworks(args: {
  account: string; domainid: string;
}): Promise<CsNetwork[]> {
  const r = await csCall<ListNetworksResponse>("listNetworks", {
    account: args.account,
    domainid: args.domainid,
    listall: "true",
    type: "Isolated"
  });
  return r.listnetworksresponse?.network ?? [];
}

// ──────────────────────────────────────────────────────────
// Virtual machines
// ──────────────────────────────────────────────────────────

export type CsVmNic = {
  id: string;
  networkid: string;
  networkname?: string;
  ipaddress?: string;
  gateway?: string;
  macaddress?: string;
};

export type CsVm = {
  id: string;
  name: string;
  state: string;
  hostname?: string;
  templateid?: string;
  templatename?: string;
  serviceofferingid?: string;
  serviceofferingname?: string;
  cpunumber?: number;
  memory?: number;
  created?: string;
  account?: string;
  domainid?: string;
  nic?: CsVmNic[];
  keypairs?: string;
};

type DeployVmResponse = {
  deployvirtualmachineresponse?: { id?: string; jobid?: string };
};
type ListVmsResponse = { listvirtualmachinesresponse?: { virtualmachine?: CsVm[] } };
type ActionVmResponse = { [key: string]: { jobid?: string } | undefined };
type ConsoleEndpointResponse = {
  createconsoleendpointresponse?: {
    consoleendpoint?: {
      success?: boolean;
      url?: string;
      details?: string;
    };
  };
};

export async function deployVm(args: {
  account: string;
  domainid: string;
  serviceofferingid: string;
  templateid: string;
  networkid: string;
  name: string;
  keypair?: string;
}): Promise<{ id: string; jobid: string }> {
  const params: CsParams = {
    account: args.account,
    domainid: args.domainid,
    serviceofferingid: args.serviceofferingid,
    templateid: args.templateid,
    zoneid: DEFAULT_ZONE_ID,
    networkids: args.networkid,
    name: args.name,
    displayname: args.name
  };
  if (args.keypair) params.keypairs = args.keypair;
  const r = await csCall<DeployVmResponse>("deployVirtualMachine", params);
  const id = r.deployvirtualmachineresponse?.id;
  const jobid = r.deployvirtualmachineresponse?.jobid;
  if (!id || !jobid) throw new Error("deployVirtualMachine returned incomplete response");
  return { id, jobid };
}

export async function listAccountVms(args: {
  account: string; domainid: string;
}): Promise<CsVm[]> {
  const r = await csCall<ListVmsResponse>("listVirtualMachines", {
    account: args.account,
    domainid: args.domainid,
    listall: "true"
  });
  return r.listvirtualmachinesresponse?.virtualmachine ?? [];
}

export async function getVm(args: {
  id: string; account: string; domainid: string;
}): Promise<CsVm | null> {
  const r = await csCall<ListVmsResponse>("listVirtualMachines", {
    id: args.id,
    account: args.account,
    domainid: args.domainid,
    listall: "true"
  });
  return r.listvirtualmachinesresponse?.virtualmachine?.[0] ?? null;
}

export async function startVm(id: string): Promise<{ jobid: string }> {
  const r = await csCall<ActionVmResponse>("startVirtualMachine", { id });
  const jobid = r.startvirtualmachineresponse?.jobid;
  if (!jobid) throw new Error("startVirtualMachine returned no jobid");
  return { jobid };
}

export async function stopVm(id: string, force = false): Promise<{ jobid: string }> {
  const r = await csCall<ActionVmResponse>("stopVirtualMachine", {
    id,
    forced: force ? "true" : "false"
  });
  const jobid = r.stopvirtualmachineresponse?.jobid;
  if (!jobid) throw new Error("stopVirtualMachine returned no jobid");
  return { jobid };
}

export async function rebootVm(id: string): Promise<{ jobid: string }> {
  const r = await csCall<ActionVmResponse>("rebootVirtualMachine", { id });
  const jobid = r.rebootvirtualmachineresponse?.jobid;
  if (!jobid) throw new Error("rebootVirtualMachine returned no jobid");
  return { jobid };
}

export async function destroyVm(id: string, expunge = true): Promise<{ jobid: string }> {
  const r = await csCall<ActionVmResponse>("destroyVirtualMachine", {
    id,
    expunge: expunge ? "true" : "false"
  });
  const jobid = r.destroyvirtualmachineresponse?.jobid;
  if (!jobid) throw new Error("destroyVirtualMachine returned no jobid");
  return { jobid };
}

export async function createConsoleEndpoint(args: {
  vmid: string;
}): Promise<{ url: string }> {
  const r = await csCall<ConsoleEndpointResponse>("createConsoleEndpoint", {
    virtualmachineid: args.vmid
  });
  const ep = r.createconsoleendpointresponse?.consoleendpoint;
  if (!ep || !ep.url) {
    throw new Error(
      `createConsoleEndpoint failed: ${JSON.stringify(r).slice(0, 300)}`
    );
  }
  return { url: ep.url };
}
