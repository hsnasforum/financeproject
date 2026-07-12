import fs from "node:fs/promises";

export class StorageCorruptedError extends Error {
  readonly code = "STORAGE_CORRUPT";
  readonly filePath: string;
  readonly lineNumber?: number;

  constructor(message: string, options: { filePath: string; lineNumber?: number; cause?: unknown }) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "StorageCorruptedError";
    this.filePath = options.filePath;
    if (options.lineNumber !== undefined) this.lineNumber = options.lineNumber;
  }
}

export class StorageUnavailableError extends Error {
  readonly code = "STORAGE_UNAVAILABLE";
  readonly filePath: string;

  constructor(message: string, options: { filePath: string; cause?: unknown }) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "StorageUnavailableError";
    this.filePath = options.filePath;
  }
}

export type JsonReadResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "not-found" };

export type NdjsonReadResult<T> =
  | { kind: "ok"; rows: Array<{ lineNumber: number; value: T }> }
  | { kind: "not-found" };

function nodeErrorCode(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return typeof code === "string" ? code : "";
}

export function isStorageNotFoundError(error: unknown): boolean {
  return nodeErrorCode(error) === "ENOENT";
}

export function toStorageReadError(error: unknown, filePath: string): StorageCorruptedError | StorageUnavailableError {
  if (error instanceof SyntaxError) {
    return new StorageCorruptedError("storage json is malformed", { filePath, cause: error });
  }
  return new StorageUnavailableError("storage file is unavailable", { filePath, cause: error });
}

export function toStorageWriteError(error: unknown, filePath: string): StorageUnavailableError {
  if (error instanceof StorageUnavailableError) return error;
  return new StorageUnavailableError("storage file is unavailable", { filePath, cause: error });
}

export function storageSchemaCorrupted(filePath: string, message = "storage schema is invalid"): StorageCorruptedError {
  return new StorageCorruptedError(message, { filePath });
}

export async function readJsonFile(filePath: string): Promise<JsonReadResult<unknown>> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return {
      kind: "ok",
      value: JSON.parse(raw) as unknown,
    };
  } catch (error) {
    if (isStorageNotFoundError(error)) return { kind: "not-found" };
    throw toStorageReadError(error, filePath);
  }
}

export async function readNdjsonFile(filePath: string): Promise<NdjsonReadResult<unknown>> {
  let raw = "";
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if (isStorageNotFoundError(error)) return { kind: "not-found" };
    throw toStorageReadError(error, filePath);
  }
  if (!raw.trim()) return { kind: "ok", rows: [] };

  const rows: Array<{ lineNumber: number; value: unknown }> = [];
  const lines = raw.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push({
        lineNumber: index + 1,
        value: JSON.parse(trimmed) as unknown,
      });
    } catch (error) {
      throw new StorageCorruptedError("storage ndjson line is malformed", {
        filePath,
        lineNumber: index + 1,
        cause: error,
      });
    }
  }
  return { kind: "ok", rows };
}
