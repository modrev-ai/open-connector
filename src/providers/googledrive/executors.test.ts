import type { ExecutionContext, ResolvedCredential, TransitFileStore } from "../../core/types.ts";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeAction } from "../../core/execution.ts";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { provider } from "./definition.ts";
import { credentialValidators, executors } from "./executors.ts";

interface CapturedRequest {
  url: URL;
  authorization: string | null;
}

const oauthCredential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
  authType: "oauth2",
  accessToken: "drive-access-token",
  tokenType: "Bearer",
  profile: { accountId: "drive:test", displayName: "Drive test", grantedScopes: [] },
  metadata: {},
};

beforeEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
});

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(undefined);
  vi.unstubAllGlobals();
});

describe("Google Drive files.get", () => {
  it("returns metadata when alt is omitted", async () => {
    const requests = stubGoogleResponses([
      Response.json({ id: "drive-file-1", name: "notes.txt", mimeType: "text/plain", size: "6" }),
    ]);

    const result = await executeGet({ fileId: "drive-file-1" });

    expect(result).toEqual({
      ok: true,
      output: {
        id: "drive-file-1",
        name: "notes.txt",
        mimeType: "text/plain",
        webViewLink: null,
        createdTime: null,
        modifiedTime: null,
        sizeBytes: 6,
        driveId: null,
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.pathname).toBe("/drive/v3/files/drive-file-1");
    expect(requests[0]?.url.searchParams.get("alt")).toBeNull();
  });

  it("downloads a blob file with shared-drive and abuse acknowledgement parameters", async () => {
    const content = new Uint8Array([72, 101, 108, 108, 111, 10]);
    const requests = stubGoogleResponses([
      Response.json({ id: "drive-file-1", name: "notes.txt", mimeType: "text/plain", size: String(content.length) }),
      new Response(content, { headers: { "content-type": "application/octet-stream" } }),
    ]);
    const { store, create } = createTransitFileStore(1024);

    const result = await executeGet(
      { fileId: "requested-file-id", alt: "media", includeSharedDrives: true, acknowledgeAbuse: true },
      store,
    );

    expect(result).toEqual({
      ok: true,
      output: {
        fileId: "drive-file-1",
        name: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: content.length,
        file: {
          fileId: "transit-file-1",
          downloadUrl: "http://localhost/api/files/transit-file-1",
          sizeBytes: content.length,
          name: "notes.txt",
          mimeType: "text/plain",
        },
      },
    });
    expect(requests).toHaveLength(2);
    expect(requests[0]?.url.pathname).toBe("/drive/v3/files/requested-file-id");
    expect(requests[0]?.url.searchParams.get("supportsAllDrives")).toBe("true");
    expect(requests[0]?.url.searchParams.get("alt")).toBeNull();
    expect(requests[1]?.url.pathname).toBe("/drive/v3/files/drive-file-1");
    expect(Object.fromEntries(requests[1]!.url.searchParams)).toEqual({
      alt: "media",
      supportsAllDrives: "true",
      acknowledgeAbuse: "true",
    });
    expect(requests.every((request) => request.authorization === "Bearer drive-access-token")).toBe(true);
    expect(create).toHaveBeenCalledOnce();
    const storedFile = create.mock.calls[0]![0];
    expect(storedFile.name).toBe("notes.txt");
    expect(storedFile.type).toBe("text/plain");
    expect(new Uint8Array(await storedFile.arrayBuffer())).toEqual(content);
  });

  it("fails without truncating when the response exceeds the transit limit", async () => {
    const requests = stubGoogleResponses([
      Response.json({ id: "drive-file-2", name: "large.bin", mimeType: "application/octet-stream" }),
      new Response(new Uint8Array([1, 2, 3])),
    ]);
    const { store, create } = createTransitFileStore(2);

    const result = await executeGet({ fileId: "drive-file-2", alt: "media" }, store);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "Google Drive download exceeds 2 bytes",
        details: { status: 413 },
      },
    });
    expect(requests).toHaveLength(2);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not start the download when the reported size exceeds the transit limit", async () => {
    const requests = stubGoogleResponses([
      Response.json({ id: "drive-file-3", name: "large.bin", mimeType: "application/octet-stream", size: "3" }),
    ]);
    const { store, create } = createTransitFileStore(2);

    const result = await executeGet({ fileId: "drive-file-3", alt: "media" }, store);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "Google Drive file exceeds local transit limit of 2 bytes",
        details: { status: 413 },
      },
    });
    expect(requests).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects Google Workspace files and directs callers to files.export", async () => {
    const requests = stubGoogleResponses([
      Response.json({
        id: "workspace-file-1",
        name: "Project plan",
        mimeType: "application/vnd.google-apps.document",
      }),
    ]);
    const { store, create } = createTransitFileStore(1024);

    const result = await executeGet({ fileId: "workspace-file-1", alt: "media" }, store);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message:
          "Google Workspace-native files cannot be downloaded with files.get alt=media. Use files.export when supported.",
      },
    });
    expect(requests).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns a clear error when transit file storage is unavailable", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await executeGet({ fileId: "drive-file-1", alt: "media" });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "files.get with alt=media requires local transit file storage.",
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("Google Drive files.list sharing capability", () => {
  /// The projection is the whole mechanism: `fields` is an allow-list, so a
  /// member dropped here is a field Drive never sends and no amount of
  /// downstream mapping can recover. Asserted on the request rather than only
  /// on the row, because a row test passes on a fixture that was never asked
  /// for.
  it("asks Drive for ownedByMe and the canShare capability", async () => {
    const requests = stubGoogleResponses([Response.json({ files: [], nextPageToken: null })]);

    await executeList({});

    const fields = requests[0]?.url.searchParams.get("fields") ?? "";
    expect(fields).toContain("ownedByMe");
    expect(fields).toContain("capabilities(canShare)");
  });

  it("passes both through when Drive answers them", async () => {
    stubGoogleResponses([
      Response.json({
        files: [
          {
            id: "folder-1",
            name: "Owned folder",
            mimeType: "application/vnd.google-apps.folder",
            ownedByMe: true,
            capabilities: { canShare: true },
          },
        ],
      }),
    ]);

    const result = await executeList({});

    expect(result.ok).toBe(true);
    const file = (result.output as { files: Record<string, unknown>[] }).files[0]!;
    expect(file.ownedByMe).toBe(true);
    expect(file.capabilities).toEqual({ canShare: true });
  });

  /// `false` is a real answer and must survive: it is the whole point of the
  /// field, and a mapper that treated falsy as absent would erase exactly the
  /// rows a caller wants to know about.
  it("keeps a negative answer rather than dropping it", async () => {
    stubGoogleResponses([
      Response.json({
        files: [
          {
            id: "folder-2",
            name: "Shared with me",
            mimeType: "application/vnd.google-apps.folder",
            ownedByMe: false,
            capabilities: { canShare: false },
          },
        ],
      }),
    ]);

    const result = await executeList({});

    const file = (result.output as { files: Record<string, unknown>[] }).files[0]!;
    expect(file.ownedByMe).toBe(false);
    expect(file.capabilities).toEqual({ canShare: false });
  });

  /// "Drive did not say" is not "the caller may not share". A default would
  /// make those two the same, and they lead a consumer to opposite actions.
  it("omits both when Drive did not answer them", async () => {
    stubGoogleResponses([
      Response.json({
        files: [{ id: "folder-3", name: "Unknown", mimeType: "application/vnd.google-apps.folder" }],
      }),
    ]);

    const result = await executeList({});

    const file = (result.output as { files: Record<string, unknown>[] }).files[0]!;
    expect(file).not.toHaveProperty("ownedByMe");
    expect(file).not.toHaveProperty("capabilities");
  });
});

describe("Google Drive catalogue metadata (TH-934)", () => {
  const catalogueFields = [
    "lastModifyingUser(displayName,emailAddress,permissionId)",
    "md5Checksum",
    "fileExtension",
    "fullFileExtension",
    "description",
    "properties",
    "appProperties",
    "imageMediaMetadata(width,height,rotation,time,cameraMake,cameraModel)",
    "videoMediaMetadata(width,height,durationMillis)",
    "shortcutDetails(targetId,targetMimeType)",
    "sharedWithMeTime",
  ];

  /// Asserted on the request: `fields` is an allow-list, so a member missing here is one Drive never sends.
  it("asks files.list for the catalogue's metadata", async () => {
    const requests = stubGoogleResponses([Response.json({ files: [] })]);

    await executeList({});

    const fields = requests[0]?.url.searchParams.get("fields") ?? "";
    for (const field of catalogueFields) {
      expect(fields).toContain(field);
    }
  });

  /// NEGATIVE: metadata only. `contentHints` (indexableText, thumbnail) and `thumbnailLink` come from the content, and
  /// an image's location is not part of what the catalogue keeps.
  it("never asks for anything derived from the content, on files.list, files.get or changes.list", async () => {
    const requests = stubGoogleResponses([
      Response.json({ files: [] }),
      Response.json({ id: "f-1", name: "a.txt", mimeType: "text/plain" }),
      Response.json({ changes: [], newStartPageToken: "t-2" }),
    ]);

    await executeList({});
    await executeGet({ fileId: "f-1" });
    await executeChanges({ pageToken: "t-1" });

    expect(requests).toHaveLength(3);
    for (const request of requests) {
      const fields = request.url.searchParams.get("fields") ?? "";
      expect(fields).not.toBe("");
      expect(fields).not.toMatch(/contentHints|indexableText|thumbnail|location|\*/);
      expect(request.url.searchParams.get("alt")).toBeNull();
    }
  });

  it("passes the metadata through with Drive's own names, and keeps the last editor", async () => {
    stubGoogleResponses([
      Response.json({
        files: [
          {
            id: "img-1",
            name: "beach.jpg",
            mimeType: "image/jpeg",
            lastModifyingUser: { displayName: "Editor One", emailAddress: "editor@example.com", permissionId: "p-1" },
            md5Checksum: "0123456789abcdef0123456789abcdef",
            fileExtension: "jpg",
            fullFileExtension: "jpg",
            description: "made-up description",
            properties: { project: "alpha", count: 3 },
            appProperties: { app: "x" },
            imageMediaMetadata: {
              width: 4000,
              height: 3000,
              time: "2024:07:01 10:00:00",
              cameraMake: "Make",
              cameraModel: "Model",
              location: { latitude: 1 },
            },
            sharedWithMeTime: "2025-01-01T00:00:00Z",
          },
          {
            id: "vid-1",
            name: "clip.mp4",
            mimeType: "video/mp4",
            videoMediaMetadata: { width: 1920, height: 1080, durationMillis: "65000" },
          },
          {
            id: "sc-1",
            name: "Shared folder",
            mimeType: "application/vnd.google-apps.shortcut",
            shortcutDetails: { targetId: "f-9", targetMimeType: "application/vnd.google-apps.folder" },
          },
        ],
      }),
    ]);

    const result = await executeList({});

    const [image, video, shortcut] = (result.output as { files: Record<string, unknown>[] }).files;
    expect(image?.lastModifyingUser).toEqual({
      displayName: "Editor One",
      emailAddress: "editor@example.com",
      permissionId: "p-1",
    });
    expect(image?.md5Checksum).toBe("0123456789abcdef0123456789abcdef");
    expect(image?.fileExtension).toBe("jpg");
    expect(image?.fullFileExtension).toBe("jpg");
    expect(image?.description).toBe("made-up description");
    expect(image?.properties).toEqual({ project: "alpha" });
    expect(image?.appProperties).toEqual({ app: "x" });
    expect(image?.imageMediaMetadata).toEqual({
      width: 4000,
      height: 3000,
      time: "2024:07:01 10:00:00",
      cameraMake: "Make",
      cameraModel: "Model",
    });
    expect(image?.sharedWithMeTime).toBe("2025-01-01T00:00:00Z");
    expect(video?.videoMediaMetadata).toEqual({ width: 1920, height: 1080, durationMillis: 65000 });
    expect(shortcut?.shortcutDetails).toEqual({
      targetId: "f-9",
      targetMimeType: "application/vnd.google-apps.folder",
    });
  });

  it("omits each one when Drive did not answer it", async () => {
    stubGoogleResponses([Response.json({ files: [{ id: "f-1", name: "a", mimeType: "text/plain" }] })]);

    const result = await executeList({});

    const file = (result.output as { files: Record<string, unknown>[] }).files[0]!;
    for (const key of [
      "lastModifyingUser",
      "md5Checksum",
      "description",
      "properties",
      "imageMediaMetadata",
      "videoMediaMetadata",
      "shortcutDetails",
      "sharedWithMeTime",
    ]) {
      expect(file[key]).toBeUndefined();
    }
  });

  it("asks changes.list for the drive and the file's metadata, and carries both", async () => {
    const requests = stubGoogleResponses([
      Response.json({
        changes: [
          {
            changeType: "drive",
            driveId: "d-1",
            time: "2026-01-01T00:00:00Z",
            drive: { id: "d-1", name: "Team", hidden: false, createdTime: "2020-01-01T00:00:00Z" },
          },
          {
            changeType: "file",
            fileId: "f-1",
            time: "2026-01-01T00:00:01Z",
            file: {
              id: "f-1",
              name: "a.pdf",
              mimeType: "application/pdf",
              lastModifyingUser: { displayName: "Editor One" },
              md5Checksum: "ab",
            },
          },
        ],
        newStartPageToken: "t-2",
      }),
    ]);

    const result = await executeChanges({ pageToken: "t-1" });

    const fields = requests[0]?.url.searchParams.get("fields") ?? "";
    expect(fields).toContain("drive(id,name,hidden,createdTime)");
    expect(fields).toContain("lastModifyingUser(displayName,emailAddress,permissionId)");
    const [drive, file] = (result.output as { changes: Record<string, any>[] }).changes;
    expect(drive?.drive).toEqual({ id: "d-1", name: "Team", hidden: false, createdTime: "2020-01-01T00:00:00Z" });
    expect(file?.drive).toBeUndefined();
    expect(file?.file.lastModifyingUser).toEqual({ displayName: "Editor One", emailAddress: null, permissionId: null });
    expect(file?.file.md5Checksum).toBe("ab");
  });
});

describe("Google Drive OAuth credential validation", () => {
  it("requests only the About user field and uses its email address as the account id", async () => {
    const requests: CapturedRequest[] = [];

    const result = await credentialValidators.oauth2!(oauthCredential, {
      fetcher: async (input, init) => {
        requests.push({
          url: new URL(String(input)),
          authorization: new Headers(init?.headers).get("authorization"),
        });
        return Response.json({ user: { emailAddress: "someone@example.com", displayName: "Someone" } });
      },
    });

    expect(result).toMatchObject({
      profile: { accountId: "someone@example.com", displayName: "Someone" },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.pathname).toBe("/drive/v3/about");
    expect(Object.fromEntries(requests[0]!.url.searchParams)).toEqual({ fields: "user" });
    expect(requests[0]?.authorization).toBe("Bearer drive-access-token");
  });

  it("falls back to the generic account id when the About user has no email address", async () => {
    const result = await credentialValidators.oauth2!(oauthCredential, {
      fetcher: async () => Response.json({ user: { displayName: "No Mail" } }),
    });

    expect(result).toMatchObject({
      profile: { accountId: "googledrive:oauth2", displayName: "No Mail" },
    });
  });
});

describe("Google Drive comments.list assignee (MRO-1024)", () => {
  /// A Docs action item is a comment assigned to someone; Drive says so only in assigneeEmailAddress, and only when the
  /// `fields` projection asks for it. Task Hub's PFC turns comments assigned to Jong into to-dos.
  it("asks Drive for the assignee and the mentions", async () => {
    const requests = stubGoogleResponses([Response.json({ comments: [] })]);

    await executeComments({ fileId: "doc-1" });

    const fields = requests[0]?.url.searchParams.get("fields") ?? "";
    expect(requests[0]?.url.pathname).toBe("/drive/v3/files/doc-1/comments");
    expect(fields).toContain("assigneeEmailAddress");
    expect(fields).toContain("mentionedEmailAddresses");
  });

  it("passes them through, and a comment no one is assigned keeps none", async () => {
    stubGoogleResponses([
      Response.json({
        comments: [
          { id: "c1", kind: "drive#comment", content: "please review", createdTime: "2026-11-14T00:00:00Z", modifiedTime: "2026-11-14T00:00:00Z", htmlContent: "please review", resolved: false, assigneeEmailAddress: "owner@example.com", mentionedEmailAddresses: ["owner@example.com"] },
          { id: "c2", kind: "drive#comment", content: "fyi", createdTime: "2026-11-14T00:00:00Z", modifiedTime: "2026-11-14T00:00:00Z", htmlContent: "fyi", resolved: false },
        ],
      }),
    ]);

    const result = await executeComments({ fileId: "doc-1" });

    expect(result.ok).toBe(true);
    const comments = (result as { output: { comments: Record<string, unknown>[] } }).output.comments;
    expect(comments[0]?.assigneeEmailAddress).toBe("owner@example.com");
    expect(comments[0]?.mentionedEmailAddresses).toEqual(["owner@example.com"]);
    // CONTROL: the field is Drive's, never invented.
    expect(comments[1]).not.toHaveProperty("assigneeEmailAddress");
  });
});

function stubGoogleResponses(responses: Response[]): CapturedRequest[] {
  const requests: CapturedRequest[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push({
      url: new URL(request.url),
      authorization: request.headers.get("authorization"),
    });
    const response = responses.shift();
    if (!response) {
      throw new Error(`Unexpected Google Drive request to ${request.url}`);
    }
    return response;
  });
  return requests;
}

function createTransitFileStore(maxBytes: number): {
  store: TransitFileStore;
  create: ReturnType<typeof vi.fn<TransitFileStore["create"]>>;
} {
  const create = vi.fn<TransitFileStore["create"]>(async (file) => ({
    fileId: "transit-file-1",
    downloadUrl: "http://localhost/api/files/transit-file-1",
    sizeBytes: file.size,
    name: file.name,
    mimeType: file.type,
  }));
  return {
    create,
    store: {
      maxBytes,
      create,
      async read() {
        throw new Error("read is not expected in this test");
      },
      async delete() {
        return false;
      },
    },
  };
}

async function executeGet(input: Record<string, unknown>, transitFiles?: TransitFileStore) {
  const context: ExecutionContext = {
    getCredential: async (service) => {
      expect(service).toBe("googledrive");
      return oauthCredential;
    },
  };
  if (transitFiles) {
    context.transitFiles = transitFiles;
  }
  return executeAction(
    provider.actions.find((action) => action.name === "files.get")!,
    executors["googledrive.files.get"],
    input,
    context,
  );
}

async function executeChanges(input: Record<string, unknown>) {
  const context: ExecutionContext = {
    getCredential: async () => oauthCredential,
  };
  return executeAction(
    provider.actions.find((action) => action.name === "changes.list")!,
    executors["googledrive.changes.list"],
    input,
    context,
  );
}

async function executeList(input: Record<string, unknown>) {
  const context: ExecutionContext = {
    getCredential: async (service) => {
      expect(service).toBe("googledrive");
      return oauthCredential;
    },
  };
  return executeAction(
    provider.actions.find((action) => action.name === "files.list")!,
    executors["googledrive.files.list"],
    input,
    context,
  );
}

async function executeComments(input: Record<string, unknown>) {
  const context: ExecutionContext = {
    getCredential: async () => oauthCredential,
  };
  return executeAction(
    provider.actions.find((action) => action.name === "comments.list")!,
    executors["googledrive.comments.list"],
    input,
    context,
  );
}
