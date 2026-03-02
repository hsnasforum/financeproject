import fs from "node:fs";
import path from "node:path";
import { type FinlifeKind } from "@/lib/finlife/types";

type FixtureScope = "product" | "company";

type FixtureKeyInput = {
  scope: FixtureScope;
  kind?: FinlifeKind;
  topFinGrpNo: string;
  pageNo: number;
};

type FixtureEnvelope = {
  fetchedAt: string;
  scope: FixtureScope;
  kind?: FinlifeKind;
  params: {
    topFinGrpNo: string;
    pageNo: number;
  };
  raw: unknown;
};

function sanitizePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
}

export function getFinlifeFixtureDir(): string {
  const configured = (process.env.FINLIFE_FIXTURE_DIR ?? "").trim();
  const dir = configured || "tmp/finlife-fixtures";
  return path.resolve(process.cwd(), dir);
}

export function buildFixtureKey(input: FixtureKeyInput): string {
  const scope = sanitizePart(input.scope);
  const kind = sanitizePart(input.kind ?? "company");
  const topFinGrpNo = sanitizePart(input.topFinGrpNo || "020000");
  const pageNo = sanitizePart(String(input.pageNo || 1));
  return `${scope}__${kind}__${topFinGrpNo}__${pageNo}.json`;
}

function resolveFixturePath(key: string): string {
  const safeKey = sanitizePart(key).replace(/\.json$/i, "") + ".json";
  return path.join(getFinlifeFixtureDir(), safeKey);
}

export function readFinlifeFixture(key: string): unknown | null {
  const filePath = resolveFixturePath(key);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as FixtureEnvelope;
    return raw?.raw ?? null;
  } catch {
    return null;
  }
}

export function writeFinlifeFixture(key: string, payload: FixtureEnvelope): void {
  if ((process.env.NODE_ENV ?? "development") === "production") {
    throw new Error("FINLIFE fixture write is disabled in production");
  }
  const filePath = resolveFixturePath(key);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}
