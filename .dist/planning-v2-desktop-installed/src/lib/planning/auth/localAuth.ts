import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  DEFAULT_PLANNING_USER_ID,
  resolvePlanningUserId,
  sanitizePlanningUserId,
} from "../store/namespace";

const pbkdf2Async = promisify(crypto.pbkdf2);
const DEFAULT_PIN_ITERATIONS = 200_000;
const DEFAULT_PIN_DIGEST = "sha256";
const DEFAULT_PIN_KEY_LENGTH = 32;

export const LOCAL_PLANNING_USERS_INDEX_PATH = ".data/planning/users/index.json";
export const PLANNING_UNLOCK_SESSION_KEY = "planning:v3:unlock:user";

export type LocalPlanningUserRecord = {
  id: string;
  name: string;
  createdAt: string;
  pinHash?: string;
  salt?: string;
  iterations?: number;
  digest?: string;
};

type LocalPlanningUsersIndex = {
  version: 1;
  users: LocalPlanningUserRecord[];
};

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning local auth is server-only.");
  }
}

function resolveUsersIndexPath(cwd = process.cwd()): string {
  const override = (process.env.PLANNING_USERS_INDEX_PATH ?? "").trim();
  return path.resolve(cwd, override || LOCAL_PLANNING_USERS_INDEX_PATH);
}

function toBase64(value: Buffer): string {
  return value.toString("base64");
}

async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  await fs.rename(tmpPath, filePath);
}

async function loadUsersIndex(cwd = process.cwd()): Promise<LocalPlanningUsersIndex> {
  const filePath = resolveUsersIndexPath(cwd);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed
      && typeof parsed === "object"
      && !Array.isArray(parsed)
      && (parsed as Record<string, unknown>).version === 1
      && Array.isArray((parsed as Record<string, unknown>).users)
    ) {
      return parsed as LocalPlanningUsersIndex;
    }
    return { version: 1, users: [] };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return { version: 1, users: [] };
    throw error;
  }
}

async function saveUsersIndex(index: LocalPlanningUsersIndex, cwd = process.cwd()): Promise<void> {
  await writeJsonAtomic(resolveUsersIndexPath(cwd), index);
}

export async function hashPlanningPin(
  pin: string,
  options?: { salt?: string; iterations?: number; digest?: string; keyLength?: number },
): Promise<{ pinHash: string; salt: string; iterations: number; digest: string; keyLength: number }> {
  const normalizedPin = pin.trim();
  if (!normalizedPin) throw new Error("PLANNING_PIN_REQUIRED");

  const iterations = Math.max(100_000, Math.trunc(options?.iterations ?? DEFAULT_PIN_ITERATIONS));
  const digest = options?.digest?.trim() || DEFAULT_PIN_DIGEST;
  const keyLength = Math.max(16, Math.trunc(options?.keyLength ?? DEFAULT_PIN_KEY_LENGTH));
  const salt = options?.salt?.trim() || toBase64(crypto.randomBytes(16));
  const derived = await pbkdf2Async(normalizedPin, Buffer.from(salt, "base64"), iterations, keyLength, digest);

  return {
    pinHash: toBase64(derived),
    salt,
    iterations,
    digest,
    keyLength,
  };
}

export async function verifyPlanningPinHash(
  pin: string,
  user: Pick<LocalPlanningUserRecord, "pinHash" | "salt" | "iterations" | "digest">,
): Promise<boolean> {
  if (!user.pinHash || !user.salt) return false;
  const hashed = await hashPlanningPin(pin, {
    salt: user.salt,
    iterations: user.iterations ?? DEFAULT_PIN_ITERATIONS,
    digest: user.digest ?? DEFAULT_PIN_DIGEST,
  });
  return crypto.timingSafeEqual(Buffer.from(user.pinHash, "base64"), Buffer.from(hashed.pinHash, "base64"));
}

export async function listLocalPlanningUsers(cwd = process.cwd()): Promise<LocalPlanningUserRecord[]> {
  assertServerOnly();
  const index = await loadUsersIndex(cwd);
  return [...index.users].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function upsertLocalPlanningUser(
  input: { id?: string; name: string; pin?: string },
  cwd = process.cwd(),
): Promise<LocalPlanningUserRecord> {
  assertServerOnly();
  const index = await loadUsersIndex(cwd);
  const nowIso = new Date().toISOString();
  const id = resolvePlanningUserId(input.id || DEFAULT_PLANNING_USER_ID);
  const name = input.name.trim() || id;
  const existingIndex = index.users.findIndex((item) => item.id === id);

  const next: LocalPlanningUserRecord = existingIndex >= 0
    ? {
      ...index.users[existingIndex],
      name,
    }
    : {
      id,
      name,
      createdAt: nowIso,
    };

  if (typeof input.pin === "string" && input.pin.trim()) {
    const hashed = await hashPlanningPin(input.pin);
    next.pinHash = hashed.pinHash;
    next.salt = hashed.salt;
    next.iterations = hashed.iterations;
    next.digest = hashed.digest;
  }

  if (existingIndex >= 0) index.users[existingIndex] = next;
  else index.users.push(next);

  await saveUsersIndex(index, cwd);
  return next;
}

export async function verifyLocalPlanningUserPin(
  userId: string,
  pin: string,
  cwd = process.cwd(),
): Promise<boolean> {
  assertServerOnly();
  const safeUserId = sanitizePlanningUserId(userId);
  const index = await loadUsersIndex(cwd);
  const user = index.users.find((row) => row.id === safeUserId);
  if (!user) return false;
  return verifyPlanningPinHash(pin, user);
}

