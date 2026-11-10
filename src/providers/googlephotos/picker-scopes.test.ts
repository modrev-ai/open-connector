import type { IConnectionStore, StoredConnection } from "../../connection-service.ts";
import type { ActionExecutor, CredentialValidators } from "../../core/types.ts";
import type { IOAuthClientConfigStore, OAuthClientConfig } from "../../oauth/oauth-client-config-service.ts";
import type { IOAuthStateStore, OAuthAuthorizationState } from "../../oauth/oauth-flow-service.ts";
import type { IProviderLoader } from "../provider-loader.ts";

import { afterEach, describe, expect, it } from "vitest";
import { createCatalogStore } from "../../catalog-store.ts";
import { ConnectionService } from "../../connection-service.ts";
import { OAuthClientConfigService } from "../../oauth/oauth-client-config-service.ts";
import { OAuthFlowService } from "../../oauth/oauth-flow-service.ts";
import { SqliteRuntimeDatabase } from "../../server/storage/sqlite-runtime-store.ts";
import { provider } from "./definition.ts";
import { googlePhotosPickerReadonlyScopes, photosPickerReadonlyScope } from "./scopes.ts";

// TH-532 criterion 4: with brainet's requestedScopes, googlephotos' consent URL asks for the Picker's read-only scope
// as its only DATA scope, plus openid and email for identity (Jong, 2026-11-08: "Add openid + email").

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

async function consentScopes(requestedScopes?: string[]): Promise<string[]> {
  const database = new SqliteRuntimeDatabase(":memory:");
  databases.push(database);
  // The real googlephotos auth definition; its actions are dropped only because this catalog loads no executors.
  const catalog = createCatalogStore([{ ...provider, actions: [] }]);
  const providerLoader = new Loader();
  const connections = new ConnectionService({ catalog, providerLoader, store: new Store() });
  const clientConfigs = new OAuthClientConfigService({ catalog, origin: "http://localhost:3000", store: new Configs() });
  await clientConfigs.upsertConfig({ service: "googlephotos", clientId: "fixture-id", clientSecret: "fixture-secret", requestedScopes });
  const flow = new OAuthFlowService({ clientConfigs, connections, providerLoader, states: new States(), requests: database.connectionRequestStore });
  const started = await flow.startAuthorization({ service: "googlephotos" });
  return (new URL(started.authorizationUrl).searchParams.get("scope") ?? "").split(" ").filter(Boolean);
}

describe("googlephotos Picker-only consent", () => {
  it("asks for exactly the Picker's read-only scope plus openid and email", async () => {
    const scopes = await consentScopes(googlePhotosPickerReadonlyScopes);
    expect(scopes.sort()).toEqual([photosPickerReadonlyScope, "openid", "email"].sort());
  });

  it("NEGATIVE: no photoslibrary scope, read or write, reaches the consent URL", async () => {
    const scopes = await consentScopes(googlePhotosPickerReadonlyScopes);
    expect(scopes.filter((scope) => scope.includes("photoslibrary"))).toEqual([]);
    const dataScopes = scopes.filter((scope) => scope.startsWith("https://"));
    expect(dataScopes).toEqual([photosPickerReadonlyScope]);
  });

  it("control: without requestedScopes the provider default does include Library scopes", async () => {
    const scopes = await consentScopes();
    expect(scopes.some((scope) => scope.includes("photoslibrary"))).toBe(true);
  });
});
