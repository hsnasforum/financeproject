import { sha256Hex, stableStringify } from "../../cache/key";
import { type RunsCreateBody } from "./createRunCommandParser";

const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/;

export type PlanningRunIdempotencyContext = {
  keyHash: string;
  lockKey: string;
  requestFingerprint: string;
  runId: string;
};

export type StoredPlanningRunIdempotencyMeta = {
  version: 1;
  keyHash: string;
  requestFingerprint: string;
  responseMeta: Record<string, unknown>;
};

export type PlanningRunIdempotencyResolution =
  | { ok: true; context: PlanningRunIdempotencyContext | null }
  | { ok: false; code: "IDEMPOTENCY_KEY_INVALID"; message: string };

const inFlightByLockKey = new Map<string, {
  requestFingerprint: string;
  promise: Promise<unknown>;
}>();

function requestPayloadWithoutCsrf(body: RunsCreateBody): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const { csrf, ...payload } = body;
  void csrf;
  return payload;
}

export function resolvePlanningRunIdempotency(input: {
  body: RunsCreateBody;
  key: string | null;
  userId: string;
}): PlanningRunIdempotencyResolution {
  if (input.key === null) {
    return { ok: true, context: null };
  }

  const key = input.key.trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    return {
      ok: false,
      code: "IDEMPOTENCY_KEY_INVALID",
      message: "Idempotency-Key는 영문자 또는 숫자로 시작하는 8~128자의 영문자, 숫자, '.', '_', ':', '-'만 사용할 수 있습니다.",
    };
  }

  const lockKey = sha256Hex(`planning-run-idempotency:v1\u0000${input.userId}\u0000${key}`);
  return {
    ok: true,
    context: {
      keyHash: sha256Hex(key),
      lockKey,
      requestFingerprint: sha256Hex(stableStringify(requestPayloadWithoutCsrf(input.body))),
      runId: `planning_idem_${lockKey.slice(0, 32)}`,
    },
  };
}

export async function withPlanningRunIdempotency<T>(
  input: Pick<PlanningRunIdempotencyContext, "lockKey" | "requestFingerprint">,
  execute: () => Promise<T>,
  onConflict: () => T | Promise<T>,
): Promise<T> {
  const current = inFlightByLockKey.get(input.lockKey) as {
    requestFingerprint: string;
    promise: Promise<T>;
  } | undefined;
  if (current) {
    if (current.requestFingerprint !== input.requestFingerprint) {
      return onConflict();
    }
    return current.promise;
  }

  const pending = Promise.resolve().then(execute);
  inFlightByLockKey.set(input.lockKey, {
    requestFingerprint: input.requestFingerprint,
    promise: pending,
  });
  try {
    return await pending;
  } finally {
    if (inFlightByLockKey.get(input.lockKey)?.promise === pending) {
      inFlightByLockKey.delete(input.lockKey);
    }
  }
}
