import type { IConnectionStore, StoredConnection } from "./connection-service.ts";
import type { ActionExecutor, CredentialValidators, ProviderDefinition, ResolvedCredential } from "./core/types.ts";
import type { IProviderLoader } from "./providers/provider-loader.ts";

import { describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "./catalog-store.ts";
import { ConnectionService } from "./connection-service.ts";
import { provider as googlePhotosProvider } from "./providers/googlephotos/definition.ts";

// TH-532: Disconnect ends an OAuth grant at the provider (RFC 7009), then deletes the stored credential.
// Fixtures only: every token below is a made-up string.

const plainOAuthProvider: ProviderDefinition = {
  service: "example",
  displayName: "Example",
  categories: ["Developer Tools"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://example.com/oauth/authorize",
      tokenUrl: "https://example.com/oauth/token",
      scopes: ["read"],
      tokenEndpointAuthMethod: "client_secret_post",
    },
  ],
  actions: [],
};

function oauthCredential(refreshToken?: string): ResolvedCredential {
  return {
    authType: "oauth2",
    accessToken: "fixture-access",
    tokenType: "Bearer",
    ...(refreshToken ? { refreshToken } : {}),
    profile: { accountId: "someone@example.com", displayName: "Someone", grantedScopes: [] },
    metadata: {},
  };
}

class MemoryStore implements IConnectionStore {
  readonly rows = new Map<string, StoredConnection>();
  async get(service: string, connectionName: string): Promise<StoredConnection | undefined> {
    return this.rows.get(`${service}:${connectionName}`);
  }
  async set(service: string, connectionName: string, credential: ResolvedCredential): Promise<StoredConnection> {
    const row = { id: crypto.randomUUID(), revision: crypto.randomUUID(), service, connectionName, credential };
    this.rows.set(`${service}:${connectionName}`, row);
    return row;
  }
  async updateCredential(): Promise<boolean> {
    return false;
  }
  async delete(service: string, connectionName: string): Promise<void> {
    this.rows.delete(`${service}:${connectionName}`);
  }
  async list(): Promise<StoredConnection[]> {
    return [...this.rows.values()];
  }
}

class NoProviderLoader implements IProviderLoader {
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

function setup(status = 200) {
  const store = new MemoryStore();
  const revocationFetch = vi.fn(async () => new Response(null, { status }));
  const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
  const service = new ConnectionService({
    catalog: createCatalogStore([googlePhotosProvider, plainOAuthProvider]),
    providerLoader: new NoProviderLoader(),
    store,
    logger,
    revocationFetch: revocationFetch as unknown as typeof fetch,
  });
  return { store, revocationFetch, logger, service };
}

describe("ConnectionService disconnect revocation", () => {
  it("revokes googlephotos' refresh token at Google, then deletes the stored credential", async () => {
    const { store, revocationFetch, service } = setup();
    await store.set("googlephotos", "default", oauthCredential("fixture-refresh"));

    const result = await service.disconnect("googlephotos");

    expect(revocationFetch).toHaveBeenCalledTimes(1);
    const [url, init] = revocationFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/revoke");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toBe("token=fixture-refresh");
    expect(result).toEqual({ service: "googlephotos", connectionName: "default", configured: false, revoked: true });
    expect(await store.get("googlephotos", "default")).toBeUndefined();
  });

  it("falls back to the access token when no refresh token was issued", async () => {
    const { store, revocationFetch, service } = setup();
    await store.set("googlephotos", "default", oauthCredential());

    await service.disconnect("googlephotos");

    const [, init] = revocationFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(init.body)).toBe("token=fixture-access");
  });

  it("NEGATIVE: still deletes locally when Google refuses, reports revoked false, and logs no token", async () => {
    const { store, service, logger } = setup(400);
    await store.set("googlephotos", "default", oauthCredential("fixture-refresh"));

    const result = await service.disconnect("googlephotos");

    expect(result).toMatchObject({ configured: false, revoked: false });
    expect(await store.get("googlephotos", "default")).toBeUndefined();
    const logged = JSON.stringify([logger.info.mock.calls, logger.warn.mock.calls, logger.error.mock.calls]);
    expect(logged).not.toContain("fixture-refresh");
    expect(logged).not.toContain("fixture-access");
  });

  it("NEGATIVE: a provider without a revocationUrl is never posted to", async () => {
    const { store, revocationFetch, service } = setup();
    await store.set("example", "default", oauthCredential("fixture-refresh"));

    const result = await service.disconnect("example");

    expect(revocationFetch).not.toHaveBeenCalled();
    expect(result).toEqual({ service: "example", connectionName: "default", configured: false });
  });
});
