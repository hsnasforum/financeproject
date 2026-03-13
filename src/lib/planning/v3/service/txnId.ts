import { createHash } from "node:crypto";
import { roundKrw } from "../../calc/roundingPolicy";

export type BuildTxnIdInput = {
  dateIso: string;
  amountKrw: number;
  descNorm?: string;
  accountId?: string;
  currency?: string;
};

const TXN_ID_HEX_LENGTH = 24;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDateIso(value: unknown): string {
  const dateIso = asString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return "";
  return dateIso;
}

function normalizeAmount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return roundKrw(parsed);
}

function normalizeToken(value: unknown): string {
  const normalized = asString(value).normalize("NFKC");
  return normalized
    .replace(/\s+/g, " ")
    .replace(/[|]/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeDescriptionForTxnId(value: unknown): string {
  const normalized = asString(value).normalize("NFKC");
  return normalized
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[()[\]{}<>"'`~!@#$%^&*+=:;,.?\\/|_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isTxnId(value: unknown): value is string {
  const text = asString(value);
  return new RegExp(`^[a-f0-9]{${TXN_ID_HEX_LENGTH}}$`).test(text);
}

export function buildTxnId(input: BuildTxnIdInput): string {
  const dateIso = normalizeDateIso(input.dateIso);
  const amountKrw = normalizeAmount(input.amountKrw);
  const descNorm = normalizeDescriptionForTxnId(input.descNorm);
  const accountId = normalizeToken(input.accountId);
  const currency = normalizeToken(input.currency || "KRW").toUpperCase() || "KRW";

  const canonical = `${dateIso}|${amountKrw}|${descNorm}|${accountId}|${currency}`;
  return createHash("sha256").update(canonical, "utf-8").digest("hex").slice(0, TXN_ID_HEX_LENGTH);
}
