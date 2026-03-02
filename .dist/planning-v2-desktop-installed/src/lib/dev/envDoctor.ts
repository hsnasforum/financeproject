export type EnvTemplateInfo = {
  requiredKeys: string[];
  optionalKeys: string[];
  allKeys: string[];
};

export type ApiEnvSpec = {
  apiName: string;
  required: string[];
};

export type UrlValidationResult = {
  apiName: string;
  ok: boolean;
  warnings: string[];
};

const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export function parseEnvTemplate(content: string): EnvTemplateInfo {
  const required = new Set<string>();
  const optional = new Set<string>();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    if (!KEY_PATTERN.test(key)) continue;

    const comment = line.slice(eq + 1).toLowerCase();
    if (comment.includes("optional")) {
      optional.add(key);
    } else {
      required.add(key);
    }
  }

  const requiredKeys = [...required].sort();
  const optionalKeys = [...optional].filter((k) => !required.has(k)).sort();
  const allKeys = [...new Set([...requiredKeys, ...optionalKeys])].sort();
  return { requiredKeys, optionalKeys, allKeys };
}

export function parseEnvKeys(content: string): string[] {
  const keys = new Set<string>();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (KEY_PATTERN.test(key)) keys.add(key);
  }
  return [...keys].sort();
}

export function computeMissingKeys(requiredKeys: string[], presentKeys: string[]): string[] {
  const present = new Set(presentKeys);
  return requiredKeys.filter((key) => !present.has(key));
}

export function computeNotLoadedYet(envLocalKeys: string[], loadedEnvKeys: string[]): string[] {
  const loaded = new Set(loadedEnvKeys);
  return envLocalKeys.filter((key) => !loaded.has(key)).sort();
}

export function validateApiUrls(specs: ApiEnvSpec[], envValues: Record<string, string | undefined>): UrlValidationResult[] {
  return specs.map((spec) => {
    const warnings: string[] = [];
    const urlKey = spec.required.find((key) => key.endsWith("_API_URL"));
    if (!urlKey) {
      return { apiName: spec.apiName, ok: true, warnings };
    }

    const raw = (envValues[urlKey] ?? "").trim();
    if (!raw) {
      warnings.push(`${urlKey} missing`);
      return { apiName: spec.apiName, ok: false, warnings };
    }

    if (!/^https?:\/\//i.test(raw)) {
      if (urlKey === "REB_SUBSCRIPTION_API_URL") {
        warnings.push(`${urlKey} must start with http:// or https://. 예: https://api.odcloud.kr/api`);
      } else {
        warnings.push(`${urlKey} must start with http:// or https://`);
      }
    }

    if (raw.includes("?")) {
      warnings.push(`${urlKey} should not include query string (?)`);
    }

    const lowered = raw.toLowerCase();
    if (lowered.includes("servicekey=") || lowered.includes("crtfc_key=") || lowered.includes("authkey=") || lowered.includes("token=")) {
      warnings.push(`${urlKey} appears to include key/token-like query params`);
    }

    return {
      apiName: spec.apiName,
      ok: warnings.length === 0,
      warnings,
    };
  });
}
