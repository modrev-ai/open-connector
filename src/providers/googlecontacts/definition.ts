import type { ProviderDefinition } from "../../core/types.ts";

import { googleContactsActions } from "./actions.ts";
import { googleContactsOAuthScopes } from "./scopes.ts";

const service = "googlecontacts";

/**
 * Google Contacts provider backed by the People API, read-only: it lists the connected account's contacts (names and
 * phone numbers) and writes nothing. One connection per Google account; connect it again to add another account.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Google Contacts",
  categories: ["Productivity", "Communication"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      // Disconnect ends the grant at Google, not only in the local store (as googlephotos, TH-532).
      revocationUrl: "https://oauth2.googleapis.com/revoke",
      scopes: googleContactsOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {
        access_type: "offline",
        // select_account: Google always shows its account chooser, so each consent names the account it is for.
        prompt: "consent select_account",
      },
    },
  ],
  homepageUrl: "https://contacts.google.com",
  actions: googleContactsActions,
};
