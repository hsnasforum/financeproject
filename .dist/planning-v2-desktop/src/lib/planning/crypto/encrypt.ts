import crypto from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(crypto.pbkdf2);

const DEFAULT_ITERATIONS = 210_000;
const DEFAULT_DIGEST = "sha256";
const DEFAULT_KEY_LENGTH = 32;
const DEFAULT_ALGORITHM = "aes-256-gcm";

export type PlanningEncryptedEnvelope = {
  version: 1;
  alg: "aes-256-gcm";
  kdf: "pbkdf2";
  iterations: number;
  digest: string;
  keyLength: number;
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

function toBase64(value: Buffer): string {
  return value.toString("base64");
}

function fromBase64(value: string): Buffer {
  return Buffer.from(value, "base64");
}

export function isPlanningEncryptedEnvelope(value: unknown): value is PlanningEncryptedEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return row.version === 1
    && row.alg === DEFAULT_ALGORITHM
    && row.kdf === "pbkdf2"
    && typeof row.salt === "string"
    && typeof row.iv === "string"
    && typeof row.tag === "string"
    && typeof row.ciphertext === "string";
}

async function deriveKey(
  passphrase: string,
  salt: Buffer,
  iterations: number,
  keyLength: number,
  digest: string,
): Promise<Buffer> {
  return pbkdf2Async(passphrase, salt, iterations, keyLength, digest);
}

export async function encryptPlanningJson(
  payload: unknown,
  passphrase: string,
): Promise<PlanningEncryptedEnvelope> {
  const normalizedPassphrase = passphrase.trim();
  if (!normalizedPassphrase) {
    throw new Error("PLANNING_ENCRYPTION_PASSPHRASE_REQUIRED");
  }

  const plaintext = Buffer.from(JSON.stringify(payload), "utf-8");
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = await deriveKey(
    normalizedPassphrase,
    salt,
    DEFAULT_ITERATIONS,
    DEFAULT_KEY_LENGTH,
    DEFAULT_DIGEST,
  );
  const cipher = crypto.createCipheriv(DEFAULT_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    version: 1,
    alg: DEFAULT_ALGORITHM,
    kdf: "pbkdf2",
    iterations: DEFAULT_ITERATIONS,
    digest: DEFAULT_DIGEST,
    keyLength: DEFAULT_KEY_LENGTH,
    salt: toBase64(salt),
    iv: toBase64(iv),
    tag: toBase64(tag),
    ciphertext: toBase64(ciphertext),
  };
}

export async function decryptPlanningJson(
  envelope: PlanningEncryptedEnvelope,
  passphrase: string,
): Promise<unknown> {
  const normalizedPassphrase = passphrase.trim();
  if (!normalizedPassphrase) {
    throw new Error("PLANNING_ENCRYPTION_PASSPHRASE_REQUIRED");
  }
  if (!isPlanningEncryptedEnvelope(envelope)) {
    throw new Error("PLANNING_ENCRYPTION_ENVELOPE_INVALID");
  }

  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  const tag = fromBase64(envelope.tag);
  const ciphertext = fromBase64(envelope.ciphertext);

  const key = await deriveKey(
    normalizedPassphrase,
    salt,
    envelope.iterations,
    envelope.keyLength,
    envelope.digest,
  );
  const decipher = crypto.createDecipheriv(DEFAULT_ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf-8")) as unknown;
}

