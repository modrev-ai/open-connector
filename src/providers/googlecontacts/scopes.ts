/**
 * TH-791: Google Contacts is read-only here. The People API's `contacts.readonly` is the one scope this provider
 * declares or requests: no write scope, no `contacts.other.readonly`, no directory scope and no identity scope.
 */
export const googleContactsReadonlyScope = "https://www.googleapis.com/auth/contacts.readonly";

export const googleContactsOAuthScopes: string[] = [googleContactsReadonlyScope];
