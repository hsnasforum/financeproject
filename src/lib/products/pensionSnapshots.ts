import path from "node:path";
import {
  FSS_PENSION_GUARANTEED_AREAS,
  FSS_PENSION_GUARANTEED_SNAPSHOT,
  FSS_PENSION_PRODUCT_AREAS,
  FSS_PENSION_PRODUCTS_SNAPSHOT,
  FSS_PENSION_SCHEMA_VERSION,
  type FssPensionGuaranteedItem,
  type FssPensionProductItem,
} from "@/lib/publicApis/providers/fssPension.mjs";
import {
  getFileIdentity,
  readStableTextFile,
  sameFileIdentity,
  type FileIdentity,
} from "../storage/atomicJsonFile";

// Server-only reader for the 통합연금포털 snapshots written by `pnpm pension:sync`.
// A missing file and a damaged file are reported separately; neither is turned into an empty list.

// Snapshot items are exactly what the provider normalization wrote.
export type PensionProductItem = FssPensionProductItem;
export type PensionGuaranteedItem = FssPensionGuaranteedItem;

export type PensionSnapshotArea = {
  code: number;
  label: string;
  sourceRows: number;
  rowCount: number;
  exactDuplicateRowsRemoved: number;
  excludedRowsWithoutProductInfo?: number;
};

type PensionSnapshotBase = {
  schemaVersion: number;
  source: { id: string; name: string; attribution: string; url: string; endpoint: string };
  generatedAt: string;
  areas: PensionSnapshotArea[];
  rowCount: number;
};

export type PensionProductsSnapshot = PensionSnapshotBase & {
  asOf: { year: number; quarter: number; label: string };
  selection: {
    attempts: Array<{ year: number; quarter: number; status: string; areaCode?: number }>;
    quartersBehind: number;
  };
  items: PensionProductItem[];
};

export type PensionGuaranteedSnapshot = PensionSnapshotBase & {
  asOf: { reportMonth: string; label: string };
  items: PensionGuaranteedItem[];
};

export type PensionSnapshotResult<T> =
  | { status: "ok"; snapshot: T }
  | { status: "missing" }
  | { status: "invalid"; reason: string };

class SnapshotShapeError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(reason: string): never {
  throw new SnapshotShapeError(reason);
}

function text(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) fail(`${label}.${key} must be non-empty text`);
  return value;
}

function nullableText(record: Record<string, unknown>, key: string, label: string): string | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== "string") fail(`${label}.${key} must be text or null`);
  return value;
}

function finite(record: Record<string, unknown>, key: string, label: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${label}.${key} must be a finite number`);
  return value;
}

function nullableFinite(record: Record<string, unknown>, key: string, label: string): number | null {
  if (record[key] === null) return null;
  return finite(record, key, label);
}

function yesNo(record: Record<string, unknown>, key: string, label: string): "Y" | "N" {
  const value = record[key];
  if (value !== "Y" && value !== "N") fail(`${label}.${key} must be Y or N`);
  return value;
}

function readBase(value: unknown, endpoint: string, knownAreas: ReadonlyArray<{ code: number }>) {
  if (!isRecord(value)) fail("snapshot must be an object");
  if (value.schemaVersion !== FSS_PENSION_SCHEMA_VERSION) fail(`schemaVersion must be ${FSS_PENSION_SCHEMA_VERSION}`);
  const source = value.source;
  if (!isRecord(source)) fail("source must be an object");
  if (text(source, "endpoint", "source") !== endpoint) fail(`source.endpoint must be ${endpoint}`);
  const generatedAt = text(value, "generatedAt", "snapshot");
  if (!Number.isFinite(Date.parse(generatedAt))) fail("generatedAt must be a date-time");
  if (!Array.isArray(value.areas) || value.areas.length === 0) fail("areas must be a non-empty array");
  const knownCodes = new Set(knownAreas.map((area) => area.code));
  const areas = value.areas.map((area, index) => {
    if (!isRecord(area)) fail(`areas[${index}] must be an object`);
    const code = finite(area, "code", `areas[${index}]`);
    if (!knownCodes.has(code)) fail(`areas[${index}].code ${code} is not a known area`);
    return area;
  });
  if (!Array.isArray(value.items)) fail("items must be an array");
  if (finite(value, "rowCount", "snapshot") !== value.items.length) fail("rowCount does not match items");
  return { record: value, source, generatedAt, areas, items: value.items as unknown[], areaCodes: new Set(areas.map((area) => area.code)) };
}

function readProductsSnapshot(value: unknown): PensionProductsSnapshot {
  const base = readBase(value, "psProdList2", FSS_PENSION_PRODUCT_AREAS);
  const asOf = base.record.asOf;
  if (!isRecord(asOf)) fail("asOf must be an object");
  const year = finite(asOf, "year", "asOf");
  const quarter = finite(asOf, "quarter", "asOf");
  if (!Number.isInteger(year) || !Number.isInteger(quarter) || quarter < 1 || quarter > 4) fail("asOf must name a year and quarter");
  text(asOf, "label", "asOf");
  const selection = base.record.selection;
  if (!isRecord(selection) || !Array.isArray(selection.attempts)) fail("selection.attempts must be an array");
  finite(selection, "quartersBehind", "selection");
  base.items.forEach((item, index) => {
    const label = `items[${index}]`;
    if (!isRecord(item)) fail(`${label} must be an object`);
    if (!base.areaCodes.has(finite(item, "areaCode", label))) fail(`${label}.areaCode is not in areas`);
    for (const key of ["area", "company", "product", "productType", "feeType"]) text(item, key, label);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text(item, "launchDate", label))) fail(`${label}.launchDate must be YYYY-MM-DD`);
    nullableText(item, "rcvMethod", label);
    yesNo(item, "sells", label);
    yesNo(item, "guarantees", label);
    for (const key of [
      "reserve", "reserve1", "reserve2", "reserve3",
      "earnRate3", "earnRate5", "earnRate7", "earnRate10", "avgTotalEarRate", "avgFeeRate",
    ]) nullableFinite(item, key, label);
  });
  return base.record as unknown as PensionProductsSnapshot;
}

function readGuaranteedSnapshot(value: unknown): PensionGuaranteedSnapshot {
  const base = readBase(value, "psGuaranteedProdList", FSS_PENSION_GUARANTEED_AREAS);
  const asOf = base.record.asOf;
  if (!isRecord(asOf)) fail("asOf must be an object");
  const reportMonth = text(asOf, "reportMonth", "asOf");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(reportMonth)) fail("asOf.reportMonth must be YYYY-MM");
  text(asOf, "label", "asOf");
  base.items.forEach((item, index) => {
    const label = `items[${index}]`;
    if (!isRecord(item)) fail(`${label} must be an object`);
    if (!base.areaCodes.has(finite(item, "areaCode", label))) fail(`${label}.areaCode is not in areas`);
    for (const key of ["area", "company", "product"]) text(item, key, label);
    if (text(item, "reportMonth", label) !== reportMonth) fail(`${label}.reportMonth differs from asOf`);
    finite(item, "publishedInterestRate", label);
    for (const key of ["guaranteedInterestRate", "fpFeeDesc", "agentFeeDesc", "onlineFeeDesc", "tel"]) nullableText(item, key, label);
  });
  return base.record as unknown as PensionGuaranteedSnapshot;
}

const memoryCache = new Map<string, { identity: FileIdentity; result: PensionSnapshotResult<unknown> }>();

function defaultDataDir(): string {
  return path.join(process.cwd(), ".data");
}

function loadSnapshot<T>(filePath: string, read: (value: unknown) => T): PensionSnapshotResult<T> {
  const identity = getFileIdentity(filePath);
  if (!identity) {
    memoryCache.delete(filePath);
    return { status: "missing" };
  }
  const cached = memoryCache.get(filePath);
  if (cached && sameFileIdentity(cached.identity, identity)) return cached.result as PensionSnapshotResult<T>;
  const stable = readStableTextFile(filePath, identity);
  if (!stable) {
    // The file changed while it was read (a sync is replacing it); report it as unreadable for this request.
    memoryCache.delete(filePath);
    return { status: "invalid", reason: "snapshot changed while it was read" };
  }
  let result: PensionSnapshotResult<T>;
  try {
    result = { status: "ok", snapshot: read(JSON.parse(stable.raw)) };
  } catch (error) {
    result = {
      status: "invalid",
      reason: error instanceof SnapshotShapeError ? error.message : "snapshot is not valid JSON",
    };
  }
  memoryCache.set(filePath, { identity: stable.identity, result });
  return result;
}

export function loadPensionProductsSnapshot(options: { dataDir?: string } = {}): PensionSnapshotResult<PensionProductsSnapshot> {
  return loadSnapshot(path.join(options.dataDir ?? defaultDataDir(), FSS_PENSION_PRODUCTS_SNAPSHOT), readProductsSnapshot);
}

export function loadPensionGuaranteedSnapshot(options: { dataDir?: string } = {}): PensionSnapshotResult<PensionGuaranteedSnapshot> {
  return loadSnapshot(path.join(options.dataDir ?? defaultDataDir(), FSS_PENSION_GUARANTEED_SNAPSHOT), readGuaranteedSnapshot);
}
