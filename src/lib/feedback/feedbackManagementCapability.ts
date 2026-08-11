import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const FEEDBACK_MANAGEMENT_COOKIE_NAME = "feedback_management";
export const FEEDBACK_MANAGEMENT_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;

const CAPABILITY_VERSION = "v1";
const CAPABILITY_PURPOSE = "feedback-management";

type FeedbackManagementCapability = {
  name: typeof FEEDBACK_MANAGEMENT_COOKIE_NAME;
  value: string;
  maxAge: number;
};

type FeedbackCapabilityEnv = Readonly<Record<string, string | undefined>>;

function readSecret(env: FeedbackCapabilityEnv): string {
  return (env.DEV_ACTION_TOKEN ?? "").trim();
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${CAPABILITY_PURPOSE}:${payload}`)
    .digest("base64url");
}

function parseCookies(cookieHeader: string): Record<string, string> {
  if (!cookieHeader.trim()) return {};
  return cookieHeader.split(";").reduce<Record<string, string>>((acc, token) => {
    const [rawName, ...rawValue] = token.split("=");
    const name = rawName?.trim();
    if (!name) return acc;
    const value = rawValue.join("=").trim();
    try {
      acc[name] = decodeURIComponent(value);
    } catch {
      acc[name] = value;
    }
    return acc;
  }, {});
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function issueFeedbackManagementCapability(
  env: FeedbackCapabilityEnv = process.env,
  nowMs = Date.now(),
): FeedbackManagementCapability | null {
  const secret = readSecret(env);
  if (!secret) return null;

  const expiresAt = nowMs + FEEDBACK_MANAGEMENT_COOKIE_MAX_AGE_SECONDS * 1000;
  const nonce = randomBytes(18).toString("base64url");
  const payload = `${CAPABILITY_VERSION}.${expiresAt}.${nonce}`;
  return {
    name: FEEDBACK_MANAGEMENT_COOKIE_NAME,
    value: `${payload}.${sign(payload, secret)}`,
    maxAge: FEEDBACK_MANAGEMENT_COOKIE_MAX_AGE_SECONDS,
  };
}

export function hasFeedbackManagementCapability(
  request: Request,
  env: FeedbackCapabilityEnv = process.env,
  nowMs = Date.now(),
): boolean {
  const secret = readSecret(env);
  if (!secret) return false;

  const cookies = parseCookies(request.headers.get("cookie") ?? "");
  const value = cookies[FEEDBACK_MANAGEMENT_COOKIE_NAME] ?? "";
  const [version, expiresAtRaw, nonce, signature, ...rest] = value.split(".");
  if (rest.length > 0 || version !== CAPABILITY_VERSION || !expiresAtRaw || !nonce || !signature) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowMs) return false;
  const latestAllowedExpiry = nowMs + FEEDBACK_MANAGEMENT_COOKIE_MAX_AGE_SECONDS * 1000 + 60_000;
  if (expiresAt > latestAllowedExpiry) return false;

  const payload = `${version}.${expiresAt}.${nonce}`;
  return signaturesMatch(signature, sign(payload, secret));
}
