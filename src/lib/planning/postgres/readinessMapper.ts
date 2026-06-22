import {
  type Account,
  type AccountTransaction,
  type OpeningBalance,
} from "../v3/domain/types";

export class PlanningPostgresReadinessMapperError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = "PlanningPostgresReadinessMapperError";
    this.field = field;
  }
}

export type PostgresDecimalSpec = {
  field: string;
  precision: number;
  scale: number;
};

export type PostgresOwnerScope = {
  userId: string;
  planningProfileId?: string | null;
  now?: Date | string;
};

export type PostgresFinancialAccountRow = {
  id: string;
  userId: string;
  planningProfileId: string | null;
  name: string;
  accountType: string;
  institution: string | null;
  balanceKrw: bigint | null;
  currency: string;
  rawJson: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PostgresOpeningBalanceRow = {
  id: string;
  userId: string;
  planningProfileId: string | null;
  financialAccountId: string;
  asOfDate: Date;
  amountKrw: bigint;
  createdAt: Date;
  updatedAt: Date;
};

export type PostgresTransactionRow = {
  id: string;
  userId: string;
  batchId: string | null;
  financialAccountId: string | null;
  occurredAt: Date;
  description: string;
  amountKrw: bigint;
  category: string | null;
  rawJson: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapperError(field: string, message: string): never {
  throw new PlanningPostgresReadinessMapperError(field, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function assertSafeIntegerNumber(value: number, field: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    mapperError(field, "expected a finite integer number");
  }
  if (!Number.isSafeInteger(value)) {
    mapperError(field, "exceeds the safe integer range of the public number API contract");
  }
  return value;
}

function coerceDbInteger(value: bigint | number | string, field: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(assertSafeIntegerNumber(value, field));
  const text = value.trim();
  if (!/^-?\d+$/u.test(text)) mapperError(field, "expected an integer database value");
  return BigInt(text);
}

export function apiKrwNumberToPostgresBigInt(value: number, field: string): bigint {
  return BigInt(assertSafeIntegerNumber(value, field));
}

export function postgresBigIntToApiKrwNumber(value: bigint | number | string, field: string): number {
  const integer = coerceDbInteger(value, field);
  const asNumberValue = Number(integer);
  if (!Number.isSafeInteger(asNumberValue) || BigInt(asNumberValue) !== integer) {
    mapperError(field, "cannot round-trip through the public number API contract");
  }
  return asNumberValue;
}

export function nullableApiKrwNumberToPostgresBigInt(value: number | null | undefined, field: string): bigint | null {
  if (value === null || value === undefined) return null;
  return apiKrwNumberToPostgresBigInt(value, field);
}

export function nullablePostgresBigIntToApiKrwNumber(
  value: bigint | number | string | null | undefined,
  field: string,
): number | undefined {
  if (value === null || value === undefined) return undefined;
  return postgresBigIntToApiKrwNumber(value, field);
}

export function apiNumberToPostgresDecimalString(value: number, spec: PostgresDecimalSpec): string {
  if (!Number.isFinite(value)) mapperError(spec.field, "expected a finite decimal number");
  if (!Number.isInteger(spec.precision) || !Number.isInteger(spec.scale) || spec.precision <= spec.scale) {
    mapperError(spec.field, "invalid decimal precision/scale");
  }

  const absoluteLimit = 10 ** (spec.precision - spec.scale);
  if (Math.abs(value) >= absoluteLimit) {
    mapperError(spec.field, `exceeds Decimal(${spec.precision}, ${spec.scale}) precision`);
  }

  const normalized = Object.is(value, -0) ? 0 : value;
  const fixed = normalized.toFixed(spec.scale);
  if (Number(fixed) !== normalized) {
    mapperError(spec.field, `requires more than ${spec.scale} decimal places`);
  }
  return fixed;
}

export function postgresDecimalToApiNumber(value: { toString(): string } | number | string, spec: PostgresDecimalSpec): number {
  const text = typeof value === "number" ? String(value) : value.toString().trim();
  if (!/^-?\d+(?:\.\d+)?$/u.test(text)) mapperError(spec.field, "expected a decimal database value");
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) mapperError(spec.field, "decimal database value is not finite");
  apiNumberToPostgresDecimalString(numeric, spec);
  return numeric;
}

function toDate(value: Date | string | undefined, field: string): Date {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) mapperError(field, "invalid date");
    return new Date(value.getTime());
  }
  const text = asString(value);
  const date = text ? new Date(text) : new Date();
  if (!Number.isFinite(date.getTime())) mapperError(field, "invalid date");
  return date;
}

function dateOnlyToUtcDate(value: string, field: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) mapperError(field, "expected YYYY-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    mapperError(field, "invalid calendar date");
  }
  return date;
}

function utcDateToDateOnly(value: Date | string, field: string): string {
  const date = toDate(value, field);
  return date.toISOString().slice(0, 10);
}

function rawJsonNote(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const note = asString(value.note);
  return note || undefined;
}

function rawJsonKind(value: unknown): AccountTransaction["kind"] | undefined {
  if (!isRecord(value)) return undefined;
  return value.kind === "income" || value.kind === "expense" || value.kind === "transfer"
    ? value.kind
    : undefined;
}

export function toPostgresFinancialAccountRow(account: Account, owner: PostgresOwnerScope): PostgresFinancialAccountRow {
  const now = toDate(owner.now, "owner.now");
  return {
    id: account.id,
    userId: owner.userId,
    planningProfileId: owner.planningProfileId ?? null,
    name: account.name,
    accountType: account.kind,
    institution: null,
    balanceKrw: nullableApiKrwNumberToPostgresBigInt(account.startingBalanceKrw, "financialAccount.balanceKrw"),
    currency: account.currency,
    rawJson: {
      source: "planning-v3-account",
      ...(account.note ? { note: account.note } : {}),
      ...(account.createdAt ? { createdAt: account.createdAt } : {}),
    },
    createdAt: toDate(account.createdAt ?? owner.now, "financialAccount.createdAt"),
    updatedAt: now,
  };
}

export function fromPostgresFinancialAccountRow(row: PostgresFinancialAccountRow): Account {
  const note = rawJsonNote(row.rawJson);
  const startingBalanceKrw = nullablePostgresBigIntToApiKrwNumber(row.balanceKrw, "financialAccount.balanceKrw");
  return {
    id: row.id,
    name: row.name,
    kind: row.accountType as Account["kind"],
    currency: "KRW",
    createdAt: row.createdAt.toISOString(),
    ...(note ? { note } : {}),
    ...(startingBalanceKrw !== undefined ? { startingBalanceKrw } : {}),
  };
}

export function toPostgresOpeningBalanceRow(
  balance: OpeningBalance,
  owner: PostgresOwnerScope,
): PostgresOpeningBalanceRow {
  const now = toDate(owner.now, "owner.now");
  return {
    id: `opening:${owner.userId}:${balance.accountId}:${balance.asOfDate}`,
    userId: owner.userId,
    planningProfileId: owner.planningProfileId ?? null,
    financialAccountId: balance.accountId,
    asOfDate: dateOnlyToUtcDate(balance.asOfDate, "openingBalance.asOfDate"),
    amountKrw: apiKrwNumberToPostgresBigInt(balance.amountKrw, "openingBalance.amountKrw"),
    createdAt: now,
    updatedAt: now,
  };
}

export function fromPostgresOpeningBalanceRow(row: PostgresOpeningBalanceRow): OpeningBalance {
  return {
    accountId: row.financialAccountId,
    asOfDate: utcDateToDateOnly(row.asOfDate, "openingBalance.asOfDate"),
    amountKrw: postgresBigIntToApiKrwNumber(row.amountKrw, "openingBalance.amountKrw"),
  };
}

export function toPostgresTransactionRow(
  transaction: AccountTransaction,
  owner: PostgresOwnerScope & { batchId?: string | null },
): PostgresTransactionRow {
  const txnId = asString(transaction.txnId);
  if (!txnId) mapperError("transaction.txnId", "required for PostgreSQL projection");
  const now = toDate(owner.now, "owner.now");

  return {
    id: txnId,
    userId: owner.userId,
    batchId: owner.batchId ?? null,
    financialAccountId: transaction.accountId ?? null,
    occurredAt: dateOnlyToUtcDate(transaction.date, "transaction.date"),
    description: transaction.description ?? "",
    amountKrw: apiKrwNumberToPostgresBigInt(transaction.amountKrw, "transaction.amountKrw"),
    category: transaction.categoryId ?? transaction.category ?? null,
    rawJson: {
      source: transaction.source,
      ...(transaction.kind ? { kind: transaction.kind } : {}),
      ...(transaction.transferGroupId ? { transferGroupId: transaction.transferGroupId } : {}),
      ...(transaction.transfer ? { transfer: transaction.transfer } : {}),
      ...(transaction.meta ? { meta: transaction.meta } : {}),
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function fromPostgresTransactionRow(row: PostgresTransactionRow): AccountTransaction {
  return {
    txnId: row.id,
    ...(row.financialAccountId ? { accountId: row.financialAccountId } : {}),
    kind: rawJsonKind(row.rawJson),
    categoryId: row.category as AccountTransaction["categoryId"],
    date: utcDateToDateOnly(row.occurredAt, "transaction.date"),
    amountKrw: postgresBigIntToApiKrwNumber(row.amountKrw, "transaction.amountKrw"),
    description: row.description,
    source: "csv",
  };
}
