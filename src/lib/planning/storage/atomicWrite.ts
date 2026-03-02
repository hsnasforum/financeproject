import fs from "node:fs/promises";
import path from "node:path";

async function fsyncDir(dirPath: string): Promise<void> {
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(dirPath, "r");
    await handle.sync();
  } catch {
    // Some environments do not allow fsync on directories.
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function atomicWriteFile(filePath: string, content: string | Uint8Array): Promise<void> {
  const absPath = path.resolve(filePath);
  const dirPath = path.dirname(absPath);
  await fs.mkdir(dirPath, { recursive: true });

  const tmpPath = `${absPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(tmpPath, "w", 0o600);
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle?.close().catch(() => undefined);
  }

  await fs.rename(tmpPath, absPath);
  await fsyncDir(dirPath);
}

export async function atomicWriteJson(filePath: string, payload: unknown): Promise<void> {
  await atomicWriteFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}
