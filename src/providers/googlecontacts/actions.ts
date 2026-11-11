import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { googleContactsReadonlyScope } from "./scopes.ts";

const service = "googlecontacts";

const phoneNumber = s.requiredObject("A phone number on a contact.", {
  value: s.string("The number as it is stored on the contact."),
  canonicalForm: s.nullableString("The number in ITU-T E.164 form, when Google could determine it."),
  type: s.nullableString("The number's type, such as mobile or home."),
});
const contact = s.requiredObject("A normalized contact: its name and phone numbers only.", {
  resourceName: s.string("The People API resource name of the contact, such as people/c123."),
  displayName: s.nullableString("The contact's display name."),
  phoneNumbers: s.array("The contact's phone numbers.", phoneNumber),
});
const pageSize = s.integer("Contacts per page, at most 1000.", { minimum: 1, maximum: 1000 });

const actions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_connections",
    operationType: "read",
    description:
      "List one page of the connected account's contacts (People API people/me/connections), with names and phone numbers only.",
    requiredScopes: [googleContactsReadonlyScope],
    providerPermissions: [googleContactsReadonlyScope],
    inputSchema: s.actionInput({
      pageSize,
      pageToken: s.string("Opaque page token returned by a previous list_connections call."),
    }),
    outputSchema: s.actionOutput({
      contacts: s.array("The contacts on this page.", contact),
      nextPageToken: s.nullableString("Token for the next page, or null on the last page."),
      totalPeople: s.nullable(s.integer("Total contacts the account holds, as Google reports it.")),
    }),
  }),
  defineProviderAction(service, {
    name: "list_all_connections",
    operationType: "read",
    description:
      "List all of the connected account's contacts, paging people/me/connections until the last page or maxContacts, with names and phone numbers only.",
    requiredScopes: [googleContactsReadonlyScope],
    providerPermissions: [googleContactsReadonlyScope],
    inputSchema: s.actionInput({
      maxContacts: s.integer("The most contacts to return across all pages.", { minimum: 1, maximum: 50000 }),
    }),
    outputSchema: s.actionOutput({
      contacts: s.array("Every contact read.", contact),
      pages: s.integer("How many pages were read."),
      truncated: s.boolean("Whether maxContacts stopped the read before the last page."),
    }),
  }),
];

export const googleContactsActions: ActionDefinition[] = actions;
