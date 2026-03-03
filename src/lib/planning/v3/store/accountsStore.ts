import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { atomicWriteJson } from "../../storage/atomicWrite";
import { resolvePlanningDataDir } from "../../storage/dataDir";
import { sanitizeRecordId } from "../../store/paths";
import { type Account } from "../domain/types";

type AccountStoreState = {
  version: 2;
  items: Account[];
};

type CreateAccountInput = {
  name: unknown;
  kind: unknown;
  note?: unknown;
  startingBalanceKrw?: unknown;
};

type UpdateAccountInput = {
  name?: unknown;
  kind?: unknown;
  note?: unknown;
  startingBalanceKrw?: unknown;
};

type UpsertAccountInput = {
  accountId?: unknown;
  name: unknown;
  kind?: unknown;
  note?: unknown;
  createdAt?: unknown;
  startingBalanceKrw?: unknown;
};

const ACCOUNT_KINDS = new Set<Account["kind"]>(["checking", "saving", "card", "cash", "other", "bank", "broker"]);
const DEFAULT_KIND: Account["kind"] = "bank";

export class AccountsStoreInputError extends Error {
  readonly details: Array<{ field: string; message: string }>;

  constructor(message: string, details: Array<{ field: string; message: string }> = []) {
    super(message);
    this.name = "AccountsStoreInputError";
    this.details = details;
  }
}

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning v3 accounts store is server-only.");
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeName(value: unknown): string {
  const name = asString(value)
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) {
    throw new AccountsStoreInputError("invalid name", [
      { field: "name", message: "계좌 이름을 입력해 주세요." },
    ]);
  }
  return name.slice(0, 80);
}

function normalizeKind(value: unknown, fallback: Account["kind"] = DEFAULT_KIND): Account["kind"] {
  const normalized = asString(value).toLowerCase();
  if (!normalized) return fallback;
  const kind = normalized as Account["kind"];

  if (!ACCOUNT_KINDS.has(kind)) {
    throw new AccountsStoreInputError("invalid kind", [
      { field: "kind", message: "계좌 유형이 올바르지 않습니다." },
    ]);
  }
  return kind;
}

function normalizeNote(value: unknown): string | undefined {
  const note = asString(value)
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!note) return undefined;
  return note.slice(0, 200);
}

function normalizeStartingBalance(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    throw new AccountsStoreInputError("invalid startingBalanceKrw", [
      { field: "startingBalanceKrw", message: "초기잔액은 1원 단위 정수로 입력해 주세요." },
    ]);
  }
  return numeric;
}

function normalizeCreatedAt(value: unknown, fallback = new Date().toISOString()): string {
  const raw = asString(value);
  if (!raw) return fallback;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return fallback;
  return new Date(ts).toISOString();
}

function normalizeAccountId(value: unknown): string {
  const text = asString(value);
  if (!text) {
    throw new AccountsStoreInputError("invalid accountId", [
      { field: "accountId", message: "계좌 ID 형식이 올바르지 않습니다." },
    ]);
  }
  try {
    return sanitizeRecordId(text);
  } catch {
    throw new AccountsStoreInputError("invalid accountId", [
      { field: "accountId", message: "계좌 ID 형식이 올바르지 않습니다." },
    ]);
  }
}

function resolveAccountsPath(cwd = process.cwd()): string {
  const override = asString(process.env.PLANNING_V3_ACCOUNTS_PATH);
  if (override) return path.resolve(cwd, override);
  return path.join(resolvePlanningDataDir({ cwd }), "planning-v3", "accounts.json");
}

function resolveLegacyAccountsPath(cwd = process.cwd()): string {
  return path.join(resolvePlanningDataDir({ cwd }), "v3", "accounts", "accounts.json");
}

function normalizeAccount(value: unknown): Account | null {
  if (!isRecord(value)) return null;

  try {
    const id = sanitizeRecordId(asString(value.id) || asString(value.accountId));
    const name = normalizeName(value.name);
    const kind = normalizeKind(value.kind);
    const note = normalizeNote(value.note);
    const startingBalanceRaw = value.startingBalanceKrw;
    const startingBalanceKrw = Number.isInteger(startingBalanceRaw)
      ? Number(startingBalanceRaw)
      : undefined;
    const createdAt = normalizeCreatedAt(value.createdAt, "");

    return {
      id,
      name,
      kind,
      currency: "KRW",
      ...(note ? { note } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(startingBalanceKrw !== undefined ? { startingBalanceKrw } : {}),
    };
  } catch {
    return null;
  }
}

function sortAccounts(accounts: Account[]): Account[] {
  return [...accounts].sort((left, right) => {
    const nameCmp = left.name.localeCompare(right.name);
    if (nameCmp !== 0) return nameCmp;
    return left.id.localeCompare(right.id);
  });
}

function parseState(parsed: unknown): AccountStoreState {
  if (isRecord(parsed) && Array.isArray(parsed.items)) {
    const items = parsed.items
      .map((item) => normalizeAccount(item))
      .filter((item): item is Account => item !== null);
    return { version: 2, items: sortAccounts(items) };
  }
  if (Array.isArray(parsed)) {
    const items = parsed
      .map((item) => normalizeAccount(item))
      .filter((item): item is Account => item !== null);
    return { version: 2, items: sortAccounts(items) };
  }
  return { version: 2, items: [] };
}

async function readState(): Promise<AccountStoreState> {
  const primaryPath = resolveAccountsPath();
  try {
    const raw = await fs.readFile(primaryPath, "utf-8");
    return parseState(JSON.parse(raw) as unknown);
  } catch {
    try {
      const legacyRaw = await fs.readFile(resolveLegacyAccountsPath(), "utf-8");
      return parseState(JSON.parse(legacyRaw) as unknown);
    } catch {
      return { version: 2, items: [] };
    }
  }
}

async function writeState(state: AccountStoreState): Promise<void> {
  await atomicWriteJson(resolveAccountsPath(), {
    version: 2,
    items: sortAccounts(state.items),
  });
}

export async function listAccounts(): Promise<Account[]> {
  assertServerOnly();
  const state = await readState();
  return sortAccounts(state.items);
}

export async function getAccount(id: string): Promise<Account | null> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);
  const state = await readState();
  return state.items.find((item) => item.id === safeId) ?? null;
}

export async function upsertAccount(input: UpsertAccountInput): Promise<Account> {
  assertServerOnly();

  const state = await readState();
  const safeId = input.accountId !== undefined && input.accountId !== null && asString(input.accountId)
    ? normalizeAccountId(input.accountId)
    : sanitizeRecordId(randomUUID());
  const index = state.items.findIndex((item) => item.id === safeId);
  const current = index >= 0 ? state.items[index] : null;

  const next: Account = {
    id: safeId,
    name: normalizeName(input.name),
    kind: normalizeKind(input.kind, current?.kind ?? DEFAULT_KIND),
    currency: "KRW",
    ...(normalizeNote(input.note) ? { note: normalizeNote(input.note) } : {}),
    createdAt: normalizeCreatedAt(input.createdAt, current?.createdAt ?? new Date().toISOString()),
    ...(input.startingBalanceKrw !== undefined
      ? (normalizeStartingBalance(input.startingBalanceKrw) !== undefined
        ? { startingBalanceKrw: normalizeStartingBalance(input.startingBalanceKrw) }
        : {})
      : (current?.startingBalanceKrw !== undefined ? { startingBalanceKrw: current.startingBalanceKrw } : {})),
  };

  if (index >= 0) {
    state.items[index] = next;
  } else {
    state.items.push(next);
  }

  await writeState(state);
  return next;
}

export async function createAccount(input: CreateAccountInput): Promise<Account> {
  assertServerOnly();
  return upsertAccount({
    name: input.name,
    kind: input.kind,
    ...(input.note !== undefined ? { note: input.note } : {}),
    ...(input.startingBalanceKrw !== undefined ? { startingBalanceKrw: input.startingBalanceKrw } : {}),
  });
}

export async function updateAccount(id: string, input: UpdateAccountInput): Promise<Account | null> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);
  const current = await getAccount(safeId);
  if (!current) return null;

  return upsertAccount({
    accountId: safeId,
    name: input.name !== undefined ? input.name : current.name,
    kind: input.kind !== undefined ? input.kind : current.kind,
    note: input.note !== undefined ? input.note : current.note,
    createdAt: current.createdAt,
    startingBalanceKrw: input.startingBalanceKrw !== undefined ? input.startingBalanceKrw : current.startingBalanceKrw,
  });
}

export async function deleteAccount(id: string): Promise<boolean> {
  assertServerOnly();
  const safeId = sanitizeRecordId(id);

  const state = await readState();
  const next = state.items.filter((item) => item.id !== safeId);
  if (next.length === state.items.length) return false;

  state.items = next;
  await writeState(state);
  return true;
}

export async function setAccountStartingBalance(id: string, startingBalanceKrw: unknown): Promise<Account | null> {
  return updateAccount(id, { startingBalanceKrw });
}
