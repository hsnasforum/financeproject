import { z } from "zod";

type V3GuardScope = "persistence" | "response";

type V3GuardViolation = {
  path: string;
  reason: "fulltext_or_raw" | "secret_key" | "secret_value";
};

const FULLTEXT_OR_RAW_KEY_PATTERN = /(^|_)(content|html|body|fulltext|full_text|article_body|raw|raw_xml|raw_csv|csv_text)(_|$)/i;
const SECRET_KEY_PATTERN = /(^|_)(api_key|apikey|token|authorization|password|secret|cookie|set_cookie|service_key|servicekey|bearer|x_api_key)(_|$)/i;
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /(api[_-]?key|service[_-]?key|authorization|bearer|token|password|secret)\s*[:=]\s*[^\s,;]+/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/gi,
];

function normalizeKey(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .toLowerCase();
}

function childPath(base: string, key: string | number): string {
  if (typeof key === "number") return `${base}[${key}]`;
  if (!base) return key;
  return `${base}.${key}`;
}

function scanValue(value: unknown, scope: V3GuardScope, basePath = "$", out: V3GuardViolation[] = []): V3GuardViolation[] {
  if (value === null || value === undefined) return out;

  if (typeof value === "string") {
    if (scope === "response") {
      for (const pattern of SECRET_VALUE_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(value)) {
          out.push({ path: basePath, reason: "secret_value" });
          break;
        }
      }
    }
    return out;
  }

  if (typeof value !== "object") return out;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      scanValue(value[i], scope, childPath(basePath, i), out);
    }
    return out;
  }

  for (const [key, nested] of Object.entries(value)) {
    const path = childPath(basePath, key);
    const normalizedKey = normalizeKey(key);
    if (FULLTEXT_OR_RAW_KEY_PATTERN.test(normalizedKey)) {
      out.push({ path, reason: "fulltext_or_raw" });
    }
    if (scope === "response" && SECRET_KEY_PATTERN.test(normalizedKey)) {
      out.push({ path, reason: "secret_key" });
    }
    scanValue(nested, scope, path, out);
  }

  return out;
}

export function assertV3Whitelisted(value: unknown, options: { scope: V3GuardScope; context?: string }): void {
  const violations = scanValue(value, options.scope);
  if (violations.length < 1) return;

  const first = violations[0];
  const context = options.context?.trim() ? ` (${options.context.trim()})` : "";
  throw new Error(`v3 whitelist violation${context}: ${first.reason} at ${first.path}; total=${violations.length}`);
}

export function parseWithV3Whitelist<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown,
  options: { scope: V3GuardScope; context?: string },
): z.infer<TSchema> {
  const parsed = schema.parse(input);
  assertV3Whitelisted(parsed, options);
  return parsed;
}

export function sanitizeV3LogMessage(message: string): string {
  let sanitized = message;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[redacted]");
  }
  return sanitized.replace(/\s+/g, " ").trim().slice(0, 400);
}
