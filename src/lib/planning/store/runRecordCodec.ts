import fs from "node:fs/promises";

import { decodeStoragePayload, encodeStoragePayload } from "../security/vaultStorage";
import { atomicWriteJson } from "../storage/atomicWrite";

export type DecodedRunStoragePayload = {
  payload: unknown;
  rewriteToVault: boolean;
};

export type JsonFileDetailedReadResult =
  | { status: "found"; value: unknown }
  | { status: "missing" }
  | { status: "invalid-json" };

export async function readJsonFileDetailed(filePath: string): Promise<JsonFileDetailedReadResult> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return {
      status: "found",
      value: JSON.parse(raw) as unknown,
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return { status: "missing" };
    if (error instanceof SyntaxError) return { status: "invalid-json" };
    throw error;
  }
}

export async function readJsonFile(filePath: string): Promise<unknown | null> {
  const result = await readJsonFileDetailed(filePath);
  return result.status === "found" ? result.value : null;
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
