import { googleIdentityScopes } from "../googleads/scopes.ts";

export const photosReadonlyAppCreatedScope = "https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata";
export const photosAppendonlyScope = "https://www.googleapis.com/auth/photoslibrary.appendonly";
export const photosEditAppCreatedScope = "https://www.googleapis.com/auth/photoslibrary.edit.appcreateddata";
export const photosPickerReadonlyScope = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";

/**
 * TH-532: the read-only Picker set brainet's Mastermind stores as googlephotos' `requestedScopes`: the Picker's one
 * DATA scope, plus `openid` and `email` for identity only (the credential validator reads the account's email from
 * userinfo, and Mastermind refuses any account but the one it expects). No Library scope, read or write.
 */
export const googlePhotosPickerReadonlyScopes: string[] = [photosPickerReadonlyScope, "openid", "email"];

export const googlePhotosOAuthScopes: string[] = [
  photosReadonlyAppCreatedScope,
  photosAppendonlyScope,
  photosEditAppCreatedScope,
  photosPickerReadonlyScope,
  ...googleIdentityScopes,
];
