import { randomBytes } from "node:crypto";
import { sha256Hex, stableStringify } from "../../planning/cache/key";
import { type OpsActionId, type OpsActionParams } from "./types";

type PreviewTokenEntry = {
  actionId: OpsActionId;
  paramsHash: string;
  expiresAtMs: number;
};

const TOKEN_TTL_MS = 5 * 60 * 1000;
const PREVIEW_TOKENS = new Map<string, PreviewTokenEntry>();

function nowMs(): number {
  return Date.now();
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanExpired(): void {
  const now = nowMs();
  for (const [token, entry] of PREVIEW_TOKENS.entries()) {
    if (entry.expiresAtMs <= now) {
      PREVIEW_TOKENS.delete(token);
    }
  }
}

function normalizeParams(params: OpsActionParams): Record<string, unknown> {
  return {
    ...(typeof params.keepDays === "number" ? { keepDays: Math.trunc(params.keepDays) } : {}),
    ...(typeof params.keepCount === "number" ? { keepCount: Math.trunc(params.keepCount) } : {}),
    ...(asString(params.profileId) ? { profileId: asString(params.profileId) } : {}),
  };
}

function paramsHash(params: OpsActionParams): string {
  return sha256Hex(stableStringify(normalizeParams(params)));
}

export function issueOpsActionPreviewToken(actionId: OpsActionId, params: OpsActionParams): string {
  cleanExpired();
  const token = randomBytes(18).toString("base64url");
  PREVIEW_TOKENS.set(token, {
    actionId,
    paramsHash: paramsHash(params),
    expiresAtMs: nowMs() + TOKEN_TTL_MS,
  });
  return token;
}

export function consumeOpsActionPreviewToken(token: string, actionId: OpsActionId, params: OpsActionParams): boolean {
  cleanExpired();
  const normalizedToken = asString(token);
  if (!normalizedToken) return false;
  const entry = PREVIEW_TOKENS.get(normalizedToken);
  if (!entry) return false;
  PREVIEW_TOKENS.delete(normalizedToken);

  if (entry.actionId !== actionId) return false;
  if (entry.expiresAtMs <= nowMs()) return false;
  if (entry.paramsHash !== paramsHash(params)) return false;

  return true;
}

export function clearOpsActionPreviewTokensForTests(): void {
  PREVIEW_TOKENS.clear();
}

export const __PREVIEW_TOKEN_TTL_MS_FOR_TESTS = TOKEN_TTL_MS;
