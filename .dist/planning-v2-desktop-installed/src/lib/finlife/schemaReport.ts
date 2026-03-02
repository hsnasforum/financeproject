import fs from "node:fs";
import path from "node:path";
import { getFinlifeFixtureDir } from "./fixtures";
import { type FinlifeKind } from "./types";
import { isSensitiveKeyName } from "./highlights";

type Counter = Map<string, number>;

type ProductReport = {
  baseKeys: Array<[string, number]>;
  optionKeys: Array<[string, number]>;
};

type SchemaReport = {
  ok: true;
  meta: { fixtureDir: string; fileCount: number; topN: number };
  report: {
    product: Partial<Record<FinlifeKind, ProductReport>>;
    company: { keys: Array<[string, number]> };
  };
};

type SchemaReportError = {
  ok: false;
  error: { code: "FIXTURE_NOT_FOUND" | "FIXTURE_EMPTY"; message: string };
};

type FixtureEnvelope = {
  scope?: "product" | "company";
  kind?: FinlifeKind;
  raw?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asItems(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is Record<string, unknown> => isRecord(entry));
}

function addKeys(counter: Counter, row: Record<string, unknown>) {
  for (const key of Object.keys(row)) {
    if (isSensitiveKeyName(key)) continue;
    counter.set(key, (counter.get(key) ?? 0) + 1);
  }
}

function topEntries(counter: Counter, topN: number): Array<[string, number]> {
  return [...counter.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, topN);
}

export function buildFinlifeSchemaReport(opts?: { dir?: string; topN?: number }): SchemaReport | SchemaReportError {
  const topN = opts?.topN ?? 30;
  const fixtureDir = path.resolve(process.cwd(), (opts?.dir ?? getFinlifeFixtureDir()).trim());

  if (!fs.existsSync(fixtureDir) || !fs.statSync(fixtureDir).isDirectory()) {
    return {
      ok: false,
      error: { code: "FIXTURE_NOT_FOUND", message: "fixture 디렉토리가 없습니다. --record로 먼저 녹화하세요." },
    };
  }

  const files = fs.readdirSync(fixtureDir).filter((file) => file.endsWith(".json"));
  if (!files.length) {
    return {
      ok: false,
      error: { code: "FIXTURE_EMPTY", message: "fixture가 비어있습니다. --record로 먼저 녹화하세요." },
    };
  }

  const productBaseCounter: Partial<Record<FinlifeKind, Counter>> = {};
  const productOptionCounter: Partial<Record<FinlifeKind, Counter>> = {};
  const companyCounter: Counter = new Map();

  for (const file of files) {
    const fullPath = path.join(fixtureDir, file);
    let parsed: FixtureEnvelope;
    try {
      parsed = JSON.parse(fs.readFileSync(fullPath, "utf8")) as FixtureEnvelope;
    } catch {
      continue;
    }

    const scope = parsed.scope;
    const raw = parsed.raw;
    if (!isRecord(raw)) continue;
    const result = isRecord(raw.result) ? raw.result : {};

    if (scope === "product" && parsed.kind) {
      const kind = parsed.kind;
      const baseItems = asItems(result.baseList);
      const optionItems = asItems(result.optionList);
      if (!productBaseCounter[kind]) productBaseCounter[kind] = new Map();
      if (!productOptionCounter[kind]) productOptionCounter[kind] = new Map();
      for (const row of baseItems) addKeys(productBaseCounter[kind] as Counter, row);
      for (const row of optionItems) addKeys(productOptionCounter[kind] as Counter, row);
      continue;
    }

    if (scope === "company") {
      const baseItems = asItems(result.baseList);
      for (const row of baseItems) addKeys(companyCounter, row);
    }
  }

  const product: Partial<Record<FinlifeKind, ProductReport>> = {};
  const kinds = new Set<FinlifeKind>([
    ...Object.keys(productBaseCounter),
    ...Object.keys(productOptionCounter),
  ] as FinlifeKind[]);
  for (const kind of kinds) {
    product[kind] = {
      baseKeys: topEntries(productBaseCounter[kind] ?? new Map(), topN),
      optionKeys: topEntries(productOptionCounter[kind] ?? new Map(), topN),
    };
  }

  return {
    ok: true,
    meta: { fixtureDir, fileCount: files.length, topN },
    report: {
      product,
      company: { keys: topEntries(companyCounter, topN) },
    },
  };
}
