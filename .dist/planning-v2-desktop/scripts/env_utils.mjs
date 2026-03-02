import fs from "node:fs";

const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export function readFileIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8");
}

export function parseEnvTemplate(content) {
  const required = new Set();
  const optional = new Set();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!KEY_PATTERN.test(key)) continue;
    const comment = line.slice(eq + 1).toLowerCase();
    if (comment.includes("optional")) optional.add(key);
    else required.add(key);
  }

  const requiredKeys = [...required].sort();
  const optionalKeys = [...optional].filter((k) => !required.has(k)).sort();
  return { requiredKeys, optionalKeys, allKeys: [...new Set([...requiredKeys, ...optionalKeys])].sort() };
}

export function parseEnvKeys(content) {
  const keys = new Set();
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

export function parseEnvKeyValues(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!KEY_PATTERN.test(key)) continue;
    values[key] = line.slice(eq + 1).trim();
  }
  return values;
}

export function validateApiUrls(specs, envValues) {
  return specs.map((spec) => {
    const warnings = [];
    const urlKey = spec.required.find((key) => key.endsWith("_API_URL"));
    if (!urlKey) return { apiName: spec.apiName, ok: true, warnings };

    const raw = (envValues[urlKey] ?? "").trim();
    if (!raw) return { apiName: spec.apiName, ok: false, warnings: [`${urlKey} missing`] };

    if (!/^https?:\/\//i.test(raw)) {
      if (urlKey === "REB_SUBSCRIPTION_API_URL") warnings.push(`${urlKey} must start with http:// or https://. 예: https://api.odcloud.kr/api`);
      else warnings.push(`${urlKey} must start with http:// or https://`);
    }
    if (raw.includes("?")) warnings.push(`${urlKey} should not include query string (?)`);
    const lowered = raw.toLowerCase();
    if (lowered.includes("servicekey=") || lowered.includes("crtfc_key=") || lowered.includes("authkey=") || lowered.includes("token=")) {
      warnings.push(`${urlKey} appears to include key/token-like query params`);
    }
    return { apiName: spec.apiName, ok: warnings.length === 0, warnings };
  });
}
