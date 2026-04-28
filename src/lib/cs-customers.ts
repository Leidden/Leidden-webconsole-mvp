import { csCall, createUserIsolatedNetwork, listAccountNetworks } from "./cloudstack";
import { prisma } from "./db";

const CUSTOMERS_DOMAIN_NAME = "customers";

type ListDomainsResponse = {
  listdomainsresponse?: {
    domain?: Array<{ id: string; name: string; path: string }>;
  };
};

type CreateDomainResponse = {
  createdomainresponse?: {
    domain?: { id: string; name: string; path: string };
  };
};

let cachedDomainId: string | null = null;

export async function ensureCustomersDomain(): Promise<string> {
  if (cachedDomainId) return cachedDomainId;
  const list = await csCall<ListDomainsResponse>("listDomains", {
    name: CUSTOMERS_DOMAIN_NAME, listall: "true"
  });
  const matched = (list.listdomainsresponse?.domain ?? []).find(
    (d) => d.name === CUSTOMERS_DOMAIN_NAME
  );
  if (matched) {
    cachedDomainId = matched.id;
    return matched.id;
  }
  const created = await csCall<CreateDomainResponse>("createDomain", {
    name: CUSTOMERS_DOMAIN_NAME
  });
  const id = created.createdomainresponse?.domain?.id;
  if (!id) throw new Error("createDomain returned no id");
  cachedDomainId = id;
  return id;
}

export const DEFAULT_USER_LIMITS = [
  { resourcetype: "0", max: "2" }, // user_vm
  { resourcetype: "1", max: "2" }, // public_ip
  { resourcetype: "6", max: "1" }  // network
] as const;

const DEFAULT_USER_NETWORK_NAME = "default";
const DEFAULT_USER_NETWORK_GATEWAY = "10.10.30.1";
const DEFAULT_USER_NETWORK_NETMASK = "255.255.255.0";

const HEALTHY_NETWORK_STATES = new Set(["Allocated", "Setup", "Implemented"]);

/**
 * Ensure the user has a default Isolated VXLAN network.
 *
 * Idempotent and self-healing:
 *  - If a DB row exists, verify the CloudStack network is still in a healthy
 *    state (Allocated/Setup/Implemented). If it's stuck in Implementing/
 *    Destroy/missing, drop the stale row and create a fresh network.
 *  - If no DB row, look in the account; otherwise call createNetwork.
 */
export async function ensureUserDefaultNetwork(args: {
  userId: string;
  account: string;
  domainid: string;
}): Promise<{ csNetworkId: string; name: string; cidr: string; gateway: string }> {
  const accountNets = await listAccountNetworks({
    account: args.account,
    domainid: args.domainid
  });

  const existing = await prisma.userNetwork.findUnique({
    where: { userId: args.userId }
  });

  if (existing) {
    const live = accountNets.find((n) => n.id === existing.csNetworkId);
    if (live && HEALTHY_NETWORK_STATES.has(live.state)) {
      return {
        csNetworkId: existing.csNetworkId,
        name: existing.name,
        cidr: existing.cidr,
        gateway: existing.gateway
      };
    }
    // stale — DB points to a network that's gone or stuck
    console.warn(
      `[ensureUserDefaultNetwork] dropping stale UserNetwork (csNetworkId=${existing.csNetworkId}, liveState=${live?.state ?? "missing"})`
    );
    await prisma.userNetwork.delete({ where: { id: existing.id } });
  }

  // Re-fetch in case the DB row pointed to nothing useful — try to reuse a
  // healthy account-level network with the canonical name.
  const matched = accountNets.find(
    (n) => n.name === DEFAULT_USER_NETWORK_NAME && HEALTHY_NETWORK_STATES.has(n.state)
  );

  let csNet;
  if (matched) {
    csNet = matched;
  } else {
    csNet = await createUserIsolatedNetwork({
      account: args.account,
      domainid: args.domainid,
      name: DEFAULT_USER_NETWORK_NAME,
      gateway: DEFAULT_USER_NETWORK_GATEWAY,
      netmask: DEFAULT_USER_NETWORK_NETMASK
    });
  }

  const cidr = csNet.cidr ?? `${DEFAULT_USER_NETWORK_GATEWAY}/24`;
  const gateway = csNet.gateway ?? DEFAULT_USER_NETWORK_GATEWAY;

  const row = await prisma.userNetwork.create({
    data: {
      userId: args.userId,
      csNetworkId: csNet.id,
      name: csNet.name,
      cidr,
      gateway
    }
  });

  return {
    csNetworkId: row.csNetworkId,
    name: row.name,
    cidr: row.cidr,
    gateway: row.gateway
  };
}
