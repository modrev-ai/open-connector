import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderFetch } from "../provider-runtime.ts";

import {
  looseArray,
  optionalRecord,
  optionalString,
  pickOptionalInteger,
  pickOptionalString,
} from "../../core/cast.ts";
import { googleJsonRequest } from "../googledrive/runtime-request.ts";
import { defineProviderExecutors, ProviderRequestError, requireOAuthCredential } from "../provider-runtime.ts";
import { googleContactsReadonlyScope } from "./scopes.ts";

/**
 * TH-791: read-only. Every request here is a GET of people/me/connections; there is no write handler and no proxy, so
 * nothing in this module can change a contact even with a broader token.
 */
const service = "googlecontacts";
const connectionsUrl = "https://people.googleapis.com/v1/people/me/connections";
/** Only these fields are asked for, so no other part of a contact (emails, addresses, notes) is ever read. */
const personFields = "names,phoneNumbers";
const maxPageSize = 1000;
const defaultMaxContacts = 50_000;

interface GoogleContactsRuntimeContext {
  accessToken: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type GoogleContactsActionHandler = (
  input: Record<string, unknown>,
  context: GoogleContactsRuntimeContext,
) => Promise<unknown>;

interface ConnectionsPayload {
  connections?: unknown;
  nextPageToken?: unknown;
  totalPeople?: unknown;
}

interface NormalizedPhoneNumber {
  value: string;
  canonicalForm: string | null;
  type: string | null;
}

interface NormalizedContact {
  resourceName: string;
  displayName: string | null;
  phoneNumbers: NormalizedPhoneNumber[];
}

interface ContactsPage {
  contacts: NormalizedContact[];
  nextPageToken: string | null;
  totalPeople: number | null;
}

export const googleContactsActionHandlers: ProviderActionHandlers<"googlecontacts", GoogleContactsActionHandler> = {
  list_connections: listConnections,
  list_all_connections: listAllConnections,
};

export const executors: ProviderExecutors = defineProviderExecutors<GoogleContactsRuntimeContext>({
  service,
  handlers: googleContactsActionHandlers,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<GoogleContactsRuntimeContext> {
    const credential = await requireOAuthCredential(context, service);
    return { accessToken: credential.accessToken, fetcher, signal: context.signal };
  },
  skipDnsValidation: true,
});

/**
 * The OAuth validator makes no call: this provider holds no identity scope, so it cannot read who the account is.
 * It refuses a consent whose token Google answered without contacts.readonly (the box left unticked on Google's
 * consent page), so a connection that could never read a contact is not stored as connected.
 */
export const credentialValidators: CredentialValidators = {
  async oauth2(input) {
    const granted = optionalString(input.metadata?.scope)?.split(" ").filter(Boolean);
    if (granted && !granted.includes(googleContactsReadonlyScope)) {
      throw new ProviderRequestError(
        403,
        "Google did not grant read access to contacts: connect again and tick the contacts box on Google's consent page.",
      );
    }
    return {
      profile: { displayName: "Google Contacts (read-only)" },
      grantedScopes: granted ?? [googleContactsReadonlyScope],
    };
  },
};

async function listConnections(
  input: Record<string, unknown>,
  context: GoogleContactsRuntimeContext,
): Promise<ContactsPage> {
  return readPage(
    context,
    pickOptionalInteger(input, "pageSize") ?? maxPageSize,
    pickOptionalString(input, "pageToken"),
  );
}

async function listAllConnections(input: Record<string, unknown>, context: GoogleContactsRuntimeContext) {
  const maxContacts = pickOptionalInteger(input, "maxContacts") ?? defaultMaxContacts;
  const contacts: NormalizedContact[] = [];
  const seenTokens = new Set<string>();
  let pageToken: string | undefined;
  let pages = 0;
  for (;;) {
    const page = await readPage(context, Math.min(maxPageSize, maxContacts - contacts.length), pageToken);
    pages += 1;
    contacts.push(...page.contacts);
    if (contacts.length >= maxContacts) {
      return {
        contacts: contacts.slice(0, maxContacts),
        pages,
        truncated: page.nextPageToken !== null || contacts.length > maxContacts,
      };
    }
    if (!page.nextPageToken) return { contacts, pages, truncated: false };
    // A token Google already gave would read the same page again, forever.
    if (seenTokens.has(page.nextPageToken)) {
      throw new ProviderRequestError(502, "Google Contacts returned a page token it had already returned.");
    }
    seenTokens.add(page.nextPageToken);
    pageToken = page.nextPageToken;
  }
}

async function readPage(
  context: GoogleContactsRuntimeContext,
  pageSize: number,
  pageToken: string | undefined,
): Promise<ContactsPage> {
  const payload = await googleJsonRequest<ConnectionsPayload>(connectionsUrl, {
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
    service,
    query: { personFields, pageSize: String(pageSize), pageToken },
  });
  const totalPeople = typeof payload.totalPeople === "number" ? payload.totalPeople : null;
  return {
    contacts: looseArray(payload.connections).flatMap((person) => normalizeContact(person)),
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
    totalPeople,
  };
}

function normalizeContact(value: unknown): NormalizedContact[] {
  const person = optionalRecord(value);
  const resourceName = optionalString(person?.resourceName);
  if (!person || !resourceName) return [];
  const names = looseArray(person.names).map((name) => optionalRecord(name));
  const primary = names.find((name) => optionalRecord(name?.metadata)?.primary === true) ?? names[0];
  return [
    {
      resourceName,
      displayName: optionalString(primary?.displayName) ?? null,
      phoneNumbers: looseArray(person.phoneNumbers).flatMap((entry) => {
        const phone = optionalRecord(entry);
        const number = optionalString(phone?.value);
        if (!number) return [];
        return [
          {
            value: number,
            canonicalForm: optionalString(phone?.canonicalForm) ?? null,
            type: optionalString(phone?.type) ?? null,
          },
        ];
      }),
    },
  ];
}
