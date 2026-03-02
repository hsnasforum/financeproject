export type DumpSafetyViolation = {
  type: "key" | "string";
  path: string;
  rule: string;
};

export const FORBIDDEN_KEYS = [
  "auth",
  "servicekey",
  "service_key",
  "apikey",
  "apikey",
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
] as const;

export const FORBIDDEN_STRING_PATTERNS = [
  "finlife.fss.or.kr",
  "finlifeapi",
  "apis.data.go.kr",
  "servicekey=",
  "auth=",
] as const;

function childPath(base: string, key: string | number): string {
  if (typeof key === "number") return `${base}[${key}]`;
  if (!base) return key;
  return `${base}.${key}`;
}

export function scanObjectForForbiddenKeysAndStrings(
  value: unknown,
  options?: {
    forbiddenKeys?: readonly string[];
    forbiddenStringPatterns?: readonly string[];
    path?: string;
  },
): DumpSafetyViolation[] {
  const forbiddenKeys = (options?.forbiddenKeys ?? FORBIDDEN_KEYS).map((v) => v.toLowerCase());
  const forbiddenPatterns = (options?.forbiddenStringPatterns ?? FORBIDDEN_STRING_PATTERNS).map((v) => v.toLowerCase());
  const basePath = options?.path ?? "";
  const out: DumpSafetyViolation[] = [];

  function walk(current: unknown, pathNow: string) {
    if (current === null || current === undefined) return;

    if (typeof current === "string") {
      const lower = current.toLowerCase();
      for (const rule of forbiddenPatterns) {
        if (lower.includes(rule)) {
          out.push({ type: "string", path: pathNow || "$", rule });
        }
      }
      return;
    }

    if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i += 1) {
        walk(current[i], childPath(pathNow || "$", i));
      }
      return;
    }

    if (typeof current === "object") {
      for (const [key, item] of Object.entries(current)) {
        const keyLower = key.toLowerCase();
        if (forbiddenKeys.includes(keyLower)) {
          out.push({ type: "key", path: childPath(pathNow || "$", key), rule: keyLower });
        }
        walk(item, childPath(pathNow || "$", key));
      }
    }
  }

  walk(value, basePath);
  return out;
}

