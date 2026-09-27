import type { ResolvedCredential } from "../../core/types.ts";

import { describe, expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { credentialValidators, jiraActionHandlers } from "./executors.ts";

const credential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
  authType: "oauth2",
  accessToken: "jira-token",
  tokenType: "Bearer",
  profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
  metadata: {},
};

describe("Jira OAuth credential validation", () => {
  it("accepts a token without an accessible Jira site", async () => {
    const result = await credentialValidators.oauth2!(credential, {
      fetcher: async () => Response.json([]),
    });

    expect(result).toEqual({
      profile: { accountId: "jira", displayName: "Jira Cloud" },
      grantedScopes: [],
      metadata: {
        resourceCount: 0,
        validationEndpoint: "/oauth/token/accessible-resources",
      },
    });
  });

  it("accepts well-formed resources without Jira product scopes", async () => {
    const result = await credentialValidators.oauth2!(credential, {
      fetcher: async () => Response.json([{ id: "cloud-123", url: "https://docs.atlassian.net", scopes: ["read:me"] }]),
    });

    expect(result).toMatchObject({
      profile: { accountId: "jira", displayName: "Jira Cloud" },
      metadata: { resourceCount: 1 },
    });
  });

  it("rejects malformed accessible-resource responses", async () => {
    await expect(
      credentialValidators.oauth2!(credential, { fetcher: async () => Response.json({}) }),
    ).rejects.toMatchObject({ status: 502, message: "jira accessible-resources response must be an array" });
  });

  it("rejects malformed accessible-resource entries", async () => {
    await expect(
      credentialValidators.oauth2!(credential, { fetcher: async () => Response.json([{}]) }),
    ).rejects.toMatchObject({ status: 502, message: "missing jira accessible resource id" });
  });
});

/**
 * Status changes as named actions, so an action-level policy can allow or refuse them.
 * A fake Jira records every request; each test states what was SENT, not only what came back.
 */

type Sent = { method: string; path: string; body?: unknown };

const transitions = [
  { id: "9", name: "Work Complete", to: { id: "10002", name: "Done" } },
  { id: "16", name: "Review Done", to: { id: "10002", name: "Done" } },
  { id: "3", name: "Not required", to: { id: "10011", name: "Closed" } },
];

function fakeJira(opts: { landed?: string; refusePost?: { status: number; body: unknown }; list?: typeof transitions } = {}) {
  const sent: Sent[] = [];
  const fetcher = (async (url: string | URL, init?: RequestInit) => {
    const u = new URL(url.toString());
    const path = u.pathname.replace(/^\/ex\/jira\/[^/]+\/rest\/api\/3/, "");
    const method = init?.method ?? "GET";
    sent.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (path === "/issue/PROJ-1/transitions" && method === "GET") return Response.json({ transitions: opts.list ?? transitions });
    if (path === "/issue/PROJ-1/transitions" && method === "POST") {
      if (opts.refusePost) return Response.json(opts.refusePost.body, { status: opts.refusePost.status });
      return new Response(null, { status: 204 });
    }
    if (path === "/issue/PROJ-1" && method === "GET") {
      return Response.json({ id: "1", key: "PROJ-1", fields: { status: { id: "99", name: opts.landed ?? "Done" } } });
    }
    return Response.json({ errorMessages: [`unexpected ${method} ${path}`] }, { status: 404 });
  }) as typeof fetch;
  const context = { accessToken: "t", fetcher, providerMetadata: { cloudId: "cloud-1" }, deployment: "cloud" as const };
  return { sent, context };
}

describe("jira.list_transitions", () => {
  it("lists each transition with the status it leads to, since the name is not the status", async () => {
    const { context } = fakeJira();
    const out = (await jiraActionHandlers.list_transitions({ issueIdOrKey: "PROJ-1" }, context)) as {
      transitions: { id: string; name: string; to: { name: string } }[];
    };
    expect(out.transitions.map((t) => [t.id, t.name, t.to.name])).toEqual([
      ["9", "Work Complete", "Done"],
      ["16", "Review Done", "Done"],
      ["3", "Not required", "Closed"],
    ]);
  });
});

describe("jira.transition_issue", () => {
  it("sends the id as a string and reports the status read back from Jira, not echoed from the request", async () => {
    // The read-back deliberately differs from the transition's own target (a workflow
    // post-function moved it on): the reply must carry what Jira says now.
    const { sent, context } = fakeJira({ landed: "In Review" });
    const out = (await jiraActionHandlers.transition_issue({ issueIdOrKey: "PROJ-1", transitionId: "9" }, context)) as {
      transition: { id: string; name: string };
      status: { name: string };
    };
    expect(sent.find((s) => s.method === "POST")?.body).toEqual({ transition: { id: "9" } });
    expect(out.transition).toEqual({ id: "9", name: "Work Complete" });
    expect(out.status.name).toBe("In Review");
    expect(sent.at(-1)).toMatchObject({ method: "GET", path: "/issue/PROJ-1" });
  });

  it("refuses a transition not available from the current status, names the ones that are, and sends nothing", async () => {
    const { sent, context } = fakeJira();
    const refused = jiraActionHandlers.transition_issue({ issueIdOrKey: "PROJ-1", transitionId: "5" }, context);
    await expect(refused).rejects.toBeInstanceOf(ProviderRequestError);
    await expect(refused).rejects.toThrow(/transition 5 is not available.*9 "Work Complete" -> Done/);
    expect(sent.some((s) => s.method === "POST")).toBe(false);
  });

  it("says Jira's own refusal, with what is available now, and never reports success", async () => {
    const { context } = fakeJira({
      refusePost: { status: 400, body: { errorMessages: ["You must resolve all subtasks first."] } },
    });
    const refused = jiraActionHandlers.transition_issue({ issueIdOrKey: "PROJ-1", transitionId: "16" }, context);
    await expect(refused).rejects.toThrow(/refused transition 16 "Review Done".*resolve all subtasks.*available now: 9/);
  });

  it("resolves an exact name, and refuses a name that matches more than one transition", async () => {
    const { sent, context } = fakeJira();
    await jiraActionHandlers.transition_issue({ issueIdOrKey: "PROJ-1", transitionName: "Not required" }, context);
    expect(sent.find((s) => s.method === "POST")?.body).toEqual({ transition: { id: "3" } });

    const twice = fakeJira({ list: [...transitions, { id: "30", name: "Not required", to: { id: "1", name: "Todo" } }] });
    await expect(
      jiraActionHandlers.transition_issue({ issueIdOrKey: "PROJ-1", transitionName: "Not required" }, twice.context),
    ).rejects.toThrow(/matches more than one/);
    expect(twice.sent.some((s) => s.method === "POST")).toBe(false);
  });

  it("requires a transitionId or a transitionName", async () => {
    const { sent, context } = fakeJira();
    await expect(jiraActionHandlers.transition_issue({ issueIdOrKey: "PROJ-1" }, context)).rejects.toThrow(
      /transitionId or transitionName is required/,
    );
    expect(sent).toEqual([]);
  });
});
