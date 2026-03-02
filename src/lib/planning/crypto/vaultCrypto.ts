import crypto from "node:crypto";

function scryptAsync(
  passphrase: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(passphrase, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey as Buffer);
    });
  });
}

export type VaultKdfParams = {
  name: "scrypt";
  N: number;
  r: number;
  p: number;
  keyLength: number;
};

export const DEFAULT_VAULT_KDF_PARAMS: VaultKdfParams = {
  name: "scrypt",
  N: 16384,
  r: 8,
  p: 1,
  keyLength: 32,
};

export type VaultEncryptedEnvelope = {
  version: 2;
  alg: "aes-256-gcm";
  enc: "key";
  iv: string;
  tag: string;
  ciphertext: string;
};

function asBase64(bytes: Buffer): string {
  return bytes.toString("base64");
}

function fromBase64(value: string): Buffer {
  return Buffer.from(value, "base64");
}

function isFiniteInt(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.trunc(value) === value;
}

export function isVaultEncryptedEnvelope(value: unknown): value is VaultEncryptedEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return row.version === 2
    && row.alg === "aes-256-gcm"
    && row.enc === "key"
    && typeof row.iv === "string"
    && typeof row.tag === "string"
    && typeof row.ciphertext === "string";
}

export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Buffer,
  kdf: VaultKdfParams = DEFAULT_VAULT_KDF_PARAMS,
): Promise<Buffer> {
  const normalized = passphrase.trim();
  if (!normalized) {
    throw new Error("VAULT_PASSPHRASE_REQUIRED");
  }
  if (!Buffer.isBuffer(salt) || salt.length < 8) {
    throw new Error("VAULT_SALT_INVALID");
  }
  if (
    kdf.name !== "scrypt"
    || !isFiniteInt(kdf.N)
    || !isFiniteInt(kdf.r)
    || !isFiniteInt(kdf.p)
    || !isFiniteInt(kdf.keyLength)
    || kdf.N < 2
    || kdf.r < 1
    || kdf.p < 1
    || kdf.keyLength < 16
  ) {
    throw new Error("VAULT_KDF_INVALID");
  }

  return scryptAsync(normalized, salt, kdf.keyLength, {
    N: kdf.N,
    r: kdf.r,
    p: kdf.p,
    maxmem: 256 * 1024 * 1024,
  });
}

export function encryptBytesWithKey(key: Buffer, bytes: Buffer): VaultEncryptedEnvelope {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error("VAULT_KEY_INVALID");
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 2,
    alg: "aes-256-gcm",
    enc: "key",
    iv: asBase64(iv),
    tag: asBase64(tag),
    ciphertext: asBase64(ciphertext),
  };
}

export function decryptBytesWithKey(key: Buffer, envelope: VaultEncryptedEnvelope): Buffer {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error("VAULT_KEY_INVALID");
  }
  if (!isVaultEncryptedEnvelope(envelope)) {
    throw new Error("VAULT_ENVELOPE_INVALID");
  }
  const iv = fromBase64(envelope.iv);
  const tag = fromBase64(envelope.tag);
  const ciphertext = fromBase64(envelope.ciphertext);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptJsonWithKey(key: Buffer, payload: unknown): VaultEncryptedEnvelope {
  const bytes = Buffer.from(JSON.stringify(payload), "utf-8");
  return encryptBytesWithKey(key, bytes);
}

export function decryptJsonWithKey(key: Buffer, envelope: VaultEncryptedEnvelope): unknown {
  const bytes = decryptBytesWithKey(key, envelope);
  return JSON.parse(bytes.toString("utf-8")) as unknown;
}
