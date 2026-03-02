import { createRequire } from "node:module";

const requireModule = createRequire(import.meta.url);

type YauzlEntry = {
  fileName?: string;
  uncompressedSize: number;
};

type YauzlReadStream = NodeJS.ReadableStream & {
  destroy: (error?: Error) => void;
  on: {
    (event: "data", handler: (chunk: Buffer | Uint8Array | string) => void): void;
    (event: "error", handler: (error: unknown) => void): void;
    (event: "end", handler: () => void): void;
  };
};

type YauzlZipFile = {
  readEntry: () => void;
  close: () => void;
  on: {
    (event: "error", handler: (error: unknown) => void): void;
    (event: "entry", handler: (entry: YauzlEntry) => void): void;
    (event: "end", handler: () => void): void;
  };
  openReadStream: (
    entry: YauzlEntry,
    callback: (error: unknown, stream: YauzlReadStream | null | undefined) => void,
  ) => void;
};

type YauzlModule = {
  fromBuffer: (
    input: Buffer,
    options: { lazyEntries: boolean; decodeStrings: boolean },
    callback: (error: unknown, zipfile: YauzlZipFile | null | undefined) => void,
  ) => void;
};

const yauzl = requireModule("yauzl") as YauzlModule;

export type ZipFileEntry = {
  path: string;
  bytes: Uint8Array;
};

const ZIP_SIG_LOCAL = 0x04034b50;
const ZIP_SIG_CENTRAL = 0x02014b50;
const ZIP_SIG_EOCD = 0x06054b50;

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function assertSafePath(pathValue: string): void {
  if (!pathValue || pathValue.startsWith("/") || pathValue.includes("\\")) {
    throw new Error(`INVALID_PATH:${pathValue}`);
  }
  const tokens = pathValue.split("/").map((item) => item.trim());
  if (tokens.some((token) => !token || token === "." || token === "..")) {
    throw new Error(`INVALID_PATH:${pathValue}`);
  }
}

function toDosDateTime(input: Date): { date: number; time: number } {
  const year = input.getUTCFullYear();
  const month = input.getUTCMonth() + 1;
  const day = input.getUTCDate();
  const hour = input.getUTCHours();
  const minute = input.getUTCMinutes();
  const second = Math.floor(input.getUTCSeconds() / 2);
  const dosDate = ((Math.max(1980, year) - 1980) << 9) | (month << 5) | day;
  const dosTime = (hour << 11) | (minute << 5) | second;
  return { date: dosDate & 0xffff, time: dosTime & 0xffff };
}

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u16(value: number): Buffer {
  const out = Buffer.allocUnsafe(2);
  out.writeUInt16LE(value & 0xffff, 0);
  return out;
}

function u32(value: number): Buffer {
  const out = Buffer.allocUnsafe(4);
  out.writeUInt32LE(value >>> 0, 0);
  return out;
}

export function encodeZip(entriesInput: ZipFileEntry[]): Buffer {
  const entries = entriesInput
    .map((entry) => {
      const pathValue = String(entry.path ?? "").trim().replaceAll("\\", "/");
      assertSafePath(pathValue);
      return {
        path: pathValue,
        bytes: Buffer.from(entry.bytes),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  const now = toDosDateTime(new Date());
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.path, "utf-8");
    const data = entry.bytes;
    const checksum = crc32(data);

    const localHeader = Buffer.concat([
      u32(ZIP_SIG_LOCAL),
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method: store
      u16(now.time),
      u16(now.date),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0), // extra length
      nameBytes,
    ]);

    localParts.push(localHeader, data);

    const centralHeader = Buffer.concat([
      u32(ZIP_SIG_CENTRAL),
      u16(20), // version made by
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method: store
      u16(now.time),
      u16(now.date),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0), // extra length
      u16(0), // comment length
      u16(0), // disk start
      u16(0), // internal attrs
      u32(0), // external attrs
      u32(offset),
      nameBytes,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const centralOffset = offset;
  const eocd = Buffer.concat([
    u32(ZIP_SIG_EOCD),
    u16(0), // disk number
    u16(0), // central start disk
    u16(entries.length),
    u16(entries.length),
    u32(centralSize),
    u32(centralOffset),
    u16(0), // comment length
  ]);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

export async function decodeZip(
  input: Uint8Array | Buffer,
  options: {
    maxEntries: number;
    maxTotalBytes: number;
    maxEntryBytes?: number;
  },
): Promise<Map<string, Buffer>> {
  const maxEntries = Math.max(1, Math.trunc(options.maxEntries));
  const maxTotalBytes = Math.max(1, Math.trunc(options.maxTotalBytes));
  const maxEntryBytes = Math.max(1, Math.trunc(options.maxEntryBytes ?? maxTotalBytes));
  const source = Buffer.isBuffer(input) ? input : Buffer.from(input);

  return new Promise<Map<string, Buffer>>((resolve, reject) => {
    yauzl.fromBuffer(source, { lazyEntries: true, decodeStrings: true }, (openErr, zipfile) => {
      if (openErr || !zipfile) {
        const message = openErr instanceof Error ? openErr.message : "open failed";
        reject(new Error(`INVALID_ZIP:${message}`));
        return;
      }

      const out = new Map<string, Buffer>();
      let totalBytes = 0;
      let finished = false;

      const fail = (error: Error) => {
        if (finished) return;
        finished = true;
        zipfile.close();
        reject(error);
      };

      zipfile.on("error", (error: unknown) => {
        const message = error instanceof Error ? error.message : "zip_error";
        fail(new Error(`INVALID_ZIP:${message}`));
      });

      zipfile.on("entry", (entry) => {
        if (finished) return;

        const fileName = String(entry.fileName ?? "").trim().replaceAll("\\", "/");
        if (!fileName || fileName.endsWith("/")) {
          zipfile.readEntry();
          return;
        }

        try {
          assertSafePath(fileName);
        } catch {
          fail(new Error(`INVALID_ZIP_ENTRY:${fileName}`));
          return;
        }

        if (out.has(fileName)) {
          fail(new Error(`DUPLICATE_ZIP_ENTRY:${fileName}`));
          return;
        }
        if (out.size >= maxEntries) {
          fail(new Error("ZIP_ENTRY_LIMIT_EXCEEDED"));
          return;
        }
        if (entry.uncompressedSize > maxEntryBytes) {
          fail(new Error(`ZIP_ENTRY_TOO_LARGE:${fileName}`));
          return;
        }

        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) {
            fail(new Error(`INVALID_ZIP_ENTRY:${fileName}`));
            return;
          }
          const chunks: Buffer[] = [];
          let entryBytes = 0;

          stream.on("data", (chunk: Buffer | Uint8Array | string) => {
            const bytes = Buffer.isBuffer(chunk)
              ? chunk
              : (typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
            entryBytes += bytes.length;
            totalBytes += bytes.length;
            if (entryBytes > maxEntryBytes || totalBytes > maxTotalBytes) {
              stream.destroy(new Error("ZIP_SIZE_LIMIT_EXCEEDED"));
              return;
            }
            chunks.push(bytes);
          });
          stream.on("error", (error: unknown) => {
            const message = error instanceof Error ? error.message : "read_stream_error";
            fail(new Error(`INVALID_ZIP_ENTRY:${message}`));
          });
          stream.on("end", () => {
            out.set(fileName, Buffer.concat(chunks));
            zipfile.readEntry();
          });
        });
      });

      zipfile.on("end", () => {
        if (finished) return;
        finished = true;
        resolve(out);
      });

      zipfile.readEntry();
    });
  });
}
