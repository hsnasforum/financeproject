import manifest from "../generated/providersManifest.json";

export type ProvidersManifest = {
  svg: string[];
  png: string[];
};

export const providersManifest: ProvidersManifest = {
  svg: Array.isArray(manifest.svg) ? manifest.svg : [],
  png: Array.isArray(manifest.png) ? manifest.png : [],
};

export function pickLogoSrc(providerKey: string | undefined, m: ProvidersManifest = providersManifest): string | null {
  const key = (providerKey ?? "").trim();
  if (!key) return null;
  if (m.svg.includes(key)) return `/providers/${key}.svg`;
  if (m.png.includes(key)) return `/providers/${key}.png`;
  return null;
}
