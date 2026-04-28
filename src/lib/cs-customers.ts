import { csCall } from "./cloudstack";

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
    name: CUSTOMERS_DOMAIN_NAME,
    listall: "true"
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

// Resource limit codes used in the MVP. See server-command-log §multi-tenant.
export const DEFAULT_USER_LIMITS = [
  { resourcetype: "0", max: "2" }, // user_vm
  { resourcetype: "1", max: "2" }, // public_ip
  { resourcetype: "6", max: "1" }  // network
] as const;
