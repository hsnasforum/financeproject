import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { type ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";

type TempUpload = {
  dir: string;
  filePath: string;
};

export async function saveUploadToTempFile(file: File, prefix = "planning-backup-upload"): Promise<TempUpload> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  const filePath = path.join(dir, "payload.bin");
  const source = Readable.fromWeb(file.stream() as unknown as NodeReadableStream);
  await pipeline(source, createWriteStream(filePath, { flags: "w" }));
  return { dir, filePath };
}

export async function readUploadBufferViaTemp(file: File, prefix = "planning-backup-upload"): Promise<Buffer> {
  const temp = await saveUploadToTempFile(file, prefix);
  try {
    return await fs.readFile(temp.filePath);
  } finally {
    await fs.rm(temp.dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
