import { csCall, csWaitJob } from "./cloudstack";

export type CsPublicIp = {
  id: string;
  ipaddress: string;
  state: string;
  issourcenat?: boolean;
  isstaticnat?: boolean;
  associatednetworkid?: string;
  associatednetworkname?: string;
  account?: string;
  zoneid?: string;
  zonename?: string;
  allocated?: string;
};

type ListPublicIpsResponse = {
  listpublicipaddressesresponse?: {
    publicipaddress?: CsPublicIp[];
  };
};

type AssociateIpResponse = {
  associateipaddressresponse?: { id?: string; jobid?: string };
};

type DisassociateIpResponse = {
  disassociateipaddressresponse?: { jobid?: string };
};

export async function listAccountPublicIps(args: {
  account: string;
  domainid: string;
}): Promise<CsPublicIp[]> {
  const r = await csCall<ListPublicIpsResponse>("listPublicIpAddresses", {
    account: args.account,
    domainid: args.domainid,
    listall: "true"
  });
  return r.listpublicipaddressesresponse?.publicipaddress ?? [];
}

export async function acquireIpForNetwork(args: {
  account: string;
  domainid: string;
  networkid: string;
}): Promise<CsPublicIp> {
  const r = await csCall<AssociateIpResponse>("associateIpAddress", {
    account: args.account,
    domainid: args.domainid,
    networkid: args.networkid
  });
  const jobid = r.associateipaddressresponse?.jobid;
  if (!jobid) throw new Error("associateIpAddress returned no jobid");
  const job = await csWaitJob(jobid, 120_000);
  if (job.jobstatus === 2) {
    const result = job.jobresult as { errortext?: string } | undefined;
    throw new Error(result?.errortext ?? "associateIpAddress failed");
  }
  const result = job.jobresult as
    | { ipaddress?: CsPublicIp }
    | undefined;
  const ip = result?.ipaddress;
  if (!ip) throw new Error("associateIpAddress: no ipaddress in result");
  return ip;
}

export async function releasePublicIp(id: string): Promise<void> {
  const r = await csCall<DisassociateIpResponse>("disassociateIpAddress", {
    id
  });
  const jobid = r.disassociateipaddressresponse?.jobid;
  if (!jobid) throw new Error("disassociateIpAddress returned no jobid");
  const job = await csWaitJob(jobid, 60_000);
  if (job.jobstatus === 2) {
    const result = job.jobresult as { errortext?: string } | undefined;
    throw new Error(result?.errortext ?? "disassociateIpAddress failed");
  }
}
