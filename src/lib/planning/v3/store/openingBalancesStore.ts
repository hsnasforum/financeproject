import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteJson } from "../../storage/atomicWrite";
import { resolvePlanningDataDir } from "../../storage/dataDir";
import { sanitizeRecordId } from "../../store/paths";
import { type OpeningBalance } from "../domain/types";

type OpeningBalancesState = {
  version: 1;
  items: Record<string, OpeningBalance>;
};

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning v3 opening balances store is server-only.");
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSafeDate(value: string): boolean {
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return false;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

function normalizeAccountId(value: unknown): string {
  const accountId = asString(value);
  if (!accountId) {
    throw new Error("invalid accountId");
  }
  return sanitizeRecordId(accountId);
}

function normalizeAsOfDate(value: unknown): string {
  const asOfDate = asString(value);
  if (!isSafeDate(asOfDate)) {
    throw new Error("invalid asOfDate");
  }
  return asOfDate;
}

function normalizeAmount(value: unknown): number {
  const amountKrw = Number(value);
  if (!Number.isFinite(amountKrw) || !Number.isInteger(amountKrw)) {
    throw new Error("invalid amountKrw");
  }
  return amountKrw;
}

function resolveOpeningBalancesPath(cwd = process.cwd()): string {
  const override = asString(process.env.PLANNING_V3_OPENING_BALANCES_PATH);
  if (override) return path.resolve(cwd, override);
  return path.join(resolvePlanningDataDir({ cwd }), "planning-v3", "opening-balances.json");
}

function normalizeOpeningBalance(value: unknown): OpeningBalance | null {
  if (!isRecord(value)) return null;
  try {
    return {
      accountId: normalizeAccountId(value.accountId),
      asOfDate: normalizeAsOfDate(value.asOfDate),
      amountKrw: normalizeAmount(value.amountKrw),
    };
  } catch {
    return null;
  }
}

function sortMap(entries: Record<string, OpeningBalance>): Record<string, OpeningBalance> {
  return Object.fromEntries(
    Object.keys(entries)
      .sort((left, right) => left.localeCompare(right))
      .map((accountId) => [accountId, entries[accountId]]),
  );
}

async function readState(): Promise<OpeningBalancesState> {
  try {
    const parsed = JSON.parse(await fs.readFile(resolveOpeningBalancesPath(), "utf-8")) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.items)) {
      return { version: 1, items: {} };
    }
    const items: Record<string, OpeningBalance> = {};
    for (const accountId of Object.keys(parsed.items)) {
      const normalized = normalizeOpeningBalance(parsed.items[accountId]);
      if (!normalized) continue;
      items[normalized.accountId] = normalized;
    }
    return {
      version: 1,
      items: sortMap(items),
    };
  } catch {
    return { version: 1, items: {} };
  }
}

async function writeState(state: OpeningBalancesState): Promise<void> {
  await atomicWriteJson(resolveOpeningBalancesPath(), {
    version: 1,
    items: sortMap(state.items),
  });
}

export async function getOpeningBalances(): Promise<Record<string, OpeningBalance>> {
  assertServerOnly();
  const state = await readState();
  return sortMap(state.items);
}

export async function upsertOpeningBalance(
  accountId: string,
  asOfDate: string,
  amountKrw: number,
): Promise<OpeningBalance> {
  assertServerOnly();
  const next: OpeningBalance = {
    accountId: normalizeAccountId(accountId),
    asOfDate: normalizeAsOfDate(asOfDate),
    amountKrw: normalizeAmount(amountKrw),
  };

  const state = await readState();
  state.items[next.accountId] = next;
  await writeState(state);
  return next;
}
