import type { IConnectionStore, StoredConnection } from "../../connection-service.ts";
import type { ActionExecutor, CredentialValidators } from "../../core/types.ts";
import type { IOAuthClientConfigStore, OAuthClientConfig } from "../../oauth/oauth-client-config-service.ts";
import type { IOAuthStateStore, OAuthAuthorizationState } from "../../oauth/oauth-flow-service.ts";
import type { IProviderLoader } from "../provider-loader.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "../../catalog-store.ts";
import { ConnectionService } from "../../connection-service.ts";
import { OAuthClientConfigService } from "../../oauth/oauth-client-config-service.ts";
import { OAuthFlowService } from "../../oauth/oauth-flow-service.ts";
import { SqliteRuntimeDatabase } from "../../server/storage/sqlite-runtime-store.ts";
import { provider } from "./definition.ts";
import { credentialValidators, googleContactsActionHandlers } from "./executors.ts";
import { googleContactsReadonlyScope } from "./scopes.ts";

// TH-791: Google Contacts through open-connector is read-only, asks for contacts.readonly and nothing else, and reads
// people/me/connections with names and phone numbers only, paged. Fixtures only: no call reaches Google.

const databases: SqliteRuntimeDatabase[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

class Configs implements IOAuthClientConfigStore {
  private readonly rows = new Map<string, OAuthClientConfig>();
  async get(service: string) {
    return this.rows.get(service);
  }
  async set(config: OAuthClientConfig) {
    this.rows.set(config.service, config);
  }
  async delete(service: string) {
    this.rows.delete(service);
  }
  async list() {
    return [...this.rows.values()];
  }
}
class States implements IOAuthStateStore {
  private readonly rows = new Map<string, OAuthAuthorizationState>();
  async deleteCreatedBefore() {}
  async set(state: OAuthAuthorizationState) {
    this.rows.set(state.state, state);
  }
  async take(state: string) {
    return this.rows.get(state);
  }
}
class Store implements IConnectionStore {
  async get(): Promise<StoredConnection | undefined> {
    return undefined;
  }
  async set(): Promise<StoredConnection> {
    throw new Error("unused");
  }
  async updateCredential() {
    return false;
  }
  async delete() {}
  async list() {
    return [];
  }
}
class Loader implements IProviderLoader {
  async loadActionExecutor(): Promise<ActionExecutor | undefined> {
    return undefined;
  }
  async loadProxyExecutor(): Promise<undefined> {
    return undefined;
  }
  async loadCredentialValidators(): Promise<CredentialValidators | undefined> {
    return undefined;
  }
}

async function consentUrl(): Promise<URL> {
  const database = new SqliteRuntimeDatabase(":memory:");
  databases.push(database);
  // The real auth definition; its actions are dropped only because this catalog loads no executors.
  const catalog = createCatalogStore([{ ...provider, actions: [] }]);
  const providerLoader = new Loader();
  const connections = new ConnectionService({ catalog, providerLoader, store: new Store() });
  const clientConfigs = new OAuthClientConfigService({
    catalog,
    origin: "http://localhost:3000",
    store: new Configs(),
  });
  await clientConfigs.upsertConfig({
    service: "googlecontacts",
    clientId: "fixture-id",
    clientSecret: "fixture-secret",
  });
  const flow = new OAuthFlowService({
    clientConfigs,
    connections,
    providerLoader,
    states: new States(),
    requests: database.connectionRequestStore,
  });
  const started = await flow.startAuthorization({ service: "googlecontacts" });
  return new URL(started.authorizationUrl);
}

const scopesOf = (url: URL): string[] => (url.searchParams.get("scope") ?? "").split(" ").filter(Boolean);

function person(id: string, name: string | null, numbers: Array<{ value: string; canonicalForm?: string }>) {
  return {
    resourceName: `people/${id}`,
    etag: "fixture-etag",
    names: name === null ? [] : [{ displayName: name, metadata: { primary: true } }],
    phoneNumbers: numbers.map((n) => ({ ...n, type: "mobile" })),
    emailAddresses: [{ value: "never-read@example.invalid" }],
  };
}

describe("googlecontacts consent", () => {
  it("asks for exactly contacts.readonly, offline, with Google's account chooser", async () => {
    const url = await consentUrl();
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(scopesOf(url)).toEqual([googleContactsReadonlyScope]);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")?.split(" ").sort()).toEqual(["consent", "select_account"]);
  });

  it("NEGATIVE: no write, other-contacts, directory or identity scope is declared or requested", async () => {
    const declared = provider.auth.flatMap((auth) => (auth.type === "oauth2" ? auth.scopes : []));
    expect(declared).toEqual([googleContactsReadonlyScope]);
    const requested = scopesOf(await consentUrl());
    expect(requested.filter((scope) => scope !== googleContactsReadonlyScope)).toEqual([]);
    expect(provider.authTypes).toEqual(["oauth2"]);
  });

  it("NEGATIVE: every action is a read and needs only contacts.readonly", () => {
    expect(provider.actions.map((action) => action.name).sort()).toEqual(["list_all_connections", "list_connections"]);
    for (const action of provider.actions) {
      expect(action.operationType).toBe("read");
      expect(action.requiredScopes).toEqual([googleContactsReadonlyScope]);
    }
    expect(Object.keys(googleContactsActionHandlers).sort()).toEqual(["list_all_connections", "list_connections"]);
  });
});

describe("googlecontacts reads", () => {
  it("reads people/me/connections with names and phone numbers only, as GET, and normalizes them", async () => {
    const fetcher: ProviderFetch = vi.fn(async (url, init) => {
      const target = new URL(url);
      expect(target.origin + target.pathname).toBe("https://people.googleapis.com/v1/people/me/connections");
      expect(target.searchParams.get("personFields")).toBe("names,phoneNumbers");
      expect(init?.method ?? "GET").toBe("GET");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-token");
      return Response.json({
        connections: [
          person("c1", "Fixture Ada", [{ value: "9123 4567", canonicalForm: "+6591234567" }]),
          person("c2", null, [{ value: "555-0100" }]),
        ],
        totalPeople: 2,
      });
    });
    const page = await googleContactsActionHandlers.list_connections({}, { accessToken: "fixture-token", fetcher });
    expect(page).toEqual({
      contacts: [
        {
          resourceName: "people/c1",
          displayName: "Fixture Ada",
          phoneNumbers: [{ value: "9123 4567", canonicalForm: "+6591234567", type: "mobile" }],
        },
        {
          resourceName: "people/c2",
          displayName: null,
          phoneNumbers: [{ value: "555-0100", canonicalForm: null, type: "mobile" }],
        },
      ],
      nextPageToken: null,
      totalPeople: 2,
    });
    expect(JSON.stringify(page)).not.toContain("never-read");
  });

  it("pages list_all_connections until the last page, passing each page token", async () => {
    const tokens: Array<string | null> = [];
    const fetcher: ProviderFetch = vi.fn(async (url) => {
      const token = new URL(url).searchParams.get("pageToken");
      tokens.push(token);
      if (token === null)
        return Response.json({ connections: [person("c1", "One", [{ value: "+15550001" }])], nextPageToken: "p2" });
      if (token === "p2")
        return Response.json({ connections: [person("c2", "Two", [{ value: "+15550002" }])], nextPageToken: "p3" });
      return Response.json({ connections: [person("c3", "Three", [{ value: "+15550003" }])] });
    });
    const all = (await googleContactsActionHandlers.list_all_connections(
      {},
      { accessToken: "fixture-token", fetcher },
    )) as {
      contacts: Array<{ displayName: string }>;
      pages: number;
      truncated: boolean;
    };
    expect(tokens).toEqual([null, "p2", "p3"]);
    expect(all.contacts.map((c) => c.displayName)).toEqual(["One", "Two", "Three"]);
    expect(all.pages).toBe(3);
    expect(all.truncated).toBe(false);
  });

  it("stops at maxContacts and says it was truncated", async () => {
    const fetcher: ProviderFetch = vi.fn(async () =>
      Response.json({
        connections: [person("c1", "One", [{ value: "+15550001" }]), person("c2", "Two", [{ value: "+15550002" }])],
        nextPageToken: "more",
      }),
    );
    const all = (await googleContactsActionHandlers.list_all_connections(
      { maxContacts: 2 },
      { accessToken: "fixture-token", fetcher },
    )) as {
      contacts: unknown[];
      truncated: boolean;
    };
    expect(all.contacts).toHaveLength(2);
    expect(all.truncated).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("NEGATIVE: a repeated page token is refused instead of read forever", async () => {
    const fetcher: ProviderFetch = vi.fn(async () => Response.json({ connections: [], nextPageToken: "same" }));
    await expect(
      googleContactsActionHandlers.list_all_connections({}, { accessToken: "fixture-token", fetcher }),
    ).rejects.toThrow(/already returned/);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("googlecontacts credential validator", () => {
  const credential = (scope: string | undefined) => ({
    authType: "oauth2" as const,
    accessToken: "fixture-token",
    tokenType: "Bearer",
    profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
    metadata: scope === undefined ? {} : { scope },
  });
  const fetcher: ProviderFetch = vi.fn(async () => {
    throw new Error("the validator must make no call");
  });

  it("keeps a token Google granted contacts.readonly, without any call", async () => {
    const result = await credentialValidators.oauth2!(credential(googleContactsReadonlyScope), { fetcher });
    expect(result).toMatchObject({ grantedScopes: [googleContactsReadonlyScope] });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("NEGATIVE: refuses a token whose grant lacks contacts.readonly (the box left unticked)", async () => {
    await expect(credentialValidators.oauth2!(credential("openid"), { fetcher })).rejects.toThrow(
      /tick the contacts box/,
    );
  });
});
