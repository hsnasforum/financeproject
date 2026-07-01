import fs from "node:fs/promises";

import { decodeStoragePayload, encodeStoragePayload } from "../security/vaultStorage";
import { atomicWriteJson } from "../storage/atomicWrite";

export type DecodedRunStoragePayload = {
  payload: unknown;
  rewriteToVault: boolean;
};

function isRecoverableJsonReadError(error: unknown): boolean {
  const nodeError = error as NodeJS.ErrnoException;
  if (nodeError?.code === "ENOENT") return true;
  return error instanceof SyntaxError;
}

export async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as unknown;
  } catch (error) {
    if (isRecoverableJsonReadError(error)) return null;
    throw error;
  }
}

export async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  await atomicWriteJson(filePath, payload);
}

export async function toStoredPayload(payload: unknown): Promise<unknown> {
  return encodeStoragePayload(payload);
}

export async function fromStoredPayload(payload: unknown): Promise<DecodedRunStoragePayload> {
  const decoded = await decodeStoragePayload(payload);
  return {
    payload: decoded.payload,
    rewriteToVault: decoded.rewriteToVault,
  };
}
