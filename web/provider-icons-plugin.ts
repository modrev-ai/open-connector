import type { Plugin } from "vite";

const catalogUrl = "https://oomol.com/en/apps/catalog.json";
const publicModuleId = "virtual:oomol-provider-icons";
const resolvedModuleId = `\0${publicModuleId}`;

interface CatalogItem {
  iconUrl?: unknown;
  service?: unknown;
}

interface CatalogPayload {
  items?: unknown;
}

interface ProviderIconsPluginOptions {
  iconUrls?: Readonly<Record<string, string>>;
}

/** Bundles OOMOL's provider icon mapping and caches it for the lifetime of the Vite process. */
export function providerIconsPlugin(options: ProviderIconsPluginOptions = {}): Plugin {
  let cachedModule: Promise<string> | undefined;

  return {
    name: "oomol-provider-icons",
    resolveId(id): string | undefined {
      return id === publicModuleId ? resolvedModuleId : undefined;
    },
    load(id): Promise<string> | undefined {
      if (id !== resolvedModuleId) {
        return undefined;
      }
      cachedModule ??= options.iconUrls
        ? Promise.resolve(serializeProviderIcons(options.iconUrls))
        : loadProviderIconsModule();
      return cachedModule;
    },
  };
}

/**
 * TH-791: the catalog is optional decoration. On 2026-11-11 the URL answered 404 and failed every image build, so an
 * unreachable or malformed catalog now builds with no icons (the UI falls back to letters), with one warning.
 */
async function loadProviderIconsModule(fetchImpl: typeof fetch = fetch): Promise<string> {
  let payload: CatalogPayload;
  try {
    const response = await fetchImpl(catalogUrl);
    if (!response.ok) {
      console.warn(`[provider-icons] catalog answered ${response.status} ${response.statusText}; building without icons`);
      return serializeProviderIcons({});
    }
    payload = (await response.json()) as CatalogPayload;
  } catch (error) {
    console.warn(`[provider-icons] catalog unreachable (${(error as Error).message}); building without icons`);
    return serializeProviderIcons({});
  }
  if (!Array.isArray(payload.items)) {
    console.warn("[provider-icons] catalog.items is not an array; building without icons");
    return serializeProviderIcons({});
  }

  const iconUrls: Record<string, string> = {};
  for (const item of payload.items as CatalogItem[]) {
    if (typeof item.service === "string" && typeof item.iconUrl === "string" && item.iconUrl.trim()) {
      iconUrls[item.service] = item.iconUrl;
    }
  }

  return serializeProviderIcons(iconUrls);
}

function serializeProviderIcons(iconUrls: Readonly<Record<string, string>>): string {
  return `export default ${JSON.stringify(iconUrls)};`;
}
