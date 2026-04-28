import { csCall, listAccountVms, listAccountNetworks } from "./cloudstack";

export type UsageItem = {
  type: "user_vm" | "public_ip" | "network";
  label: string;
  current: number;
  max: number; // -1 = unlimited
};

const LABELS: Record<UsageItem["type"], string> = {
  user_vm: "Virtual machines",
  public_ip: "Public IPs",
  network: "Networks"
};

type ListResourceLimitsResponse = {
  listresourcelimitsresponse?: {
    resourcelimit?: Array<{
      resourcetype?: string;
      resourcetypename?: string;
      max?: number | string;
    }>;
  };
};

type ListPublicIpsResponse = {
  listpublicipaddressesresponse?: {
    publicipaddress?: Array<{ id: string; state?: string }>;
  };
};

const NON_COUNTING_VM_STATES = new Set([
  "Expunging",
  "Destroyed",
  "Error"
]);

const NON_COUNTING_NET_STATES = new Set(["Destroy"]);

const NON_COUNTING_IP_STATES = new Set(["Releasing", "Released"]);

export async function getAccountUsage(args: {
  account: string;
  domainid: string;
}): Promise<UsageItem[]> {
  const [limitsRes, vms, ipsRes, nets] = await Promise.all([
    csCall<ListResourceLimitsResponse>("listResourceLimits", {
      account: args.account,
      domainid: args.domainid
    }),
    listAccountVms({ account: args.account, domainid: args.domainid }),
    csCall<ListPublicIpsResponse>("listPublicIpAddresses", {
      account: args.account,
      domainid: args.domainid,
      listall: "true"
    }),
    listAccountNetworks({ account: args.account, domainid: args.domainid })
  ]);

  const maxByType = new Map<string, number>();
  for (const lim of limitsRes.listresourcelimitsresponse?.resourcelimit ?? []) {
    const name = lim.resourcetypename;
    if (!name) continue;
    const m = typeof lim.max === "string" ? parseInt(lim.max, 10) : lim.max;
    if (typeof m === "number" && !Number.isNaN(m)) maxByType.set(name, m);
  }

  const vmCount = vms.filter((v) => !NON_COUNTING_VM_STATES.has(v.state)).length;
  const ipCount = (ipsRes.listpublicipaddressesresponse?.publicipaddress ?? [])
    .filter((p) => !NON_COUNTING_IP_STATES.has(p.state ?? "")).length;
  const netCount = nets.filter((n) => !NON_COUNTING_NET_STATES.has(n.state)).length;

  const order: UsageItem["type"][] = ["user_vm", "public_ip", "network"];
  return order.map((type) => ({
    type,
    label: LABELS[type],
    current:
      type === "user_vm" ? vmCount : type === "public_ip" ? ipCount : netCount,
    max: maxByType.get(type) ?? -1
  }));
}
