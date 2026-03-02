import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export const FINLIFE_DUMP_SCHEMA_VERSION = 1;
export const SUPPORTED_FINLIFE_DUMP_SCHEMA_VERSIONS = new Set([FINLIFE_DUMP_SCHEMA_VERSION]);

export function makeDumpFilePath(kind, { gzip = false, out = "" } = {}) {
  if (out && out.trim()) {
    const absolute = path.isAbsolute(out) ? out : path.join(process.cwd(), out);
    return absolute;
  }
  const ext = gzip ? "json.gz" : "json";
  return path.join(process.cwd(), "artifacts", `finlife_${kind}.normalized.v${FINLIFE_DUMP_SCHEMA_VERSION}.${ext}`);
}

export function detectSchemaVersion(raw) {
  const schemaVersionRaw = raw?.schemaVersion;
  if (schemaVersionRaw === undefined || schemaVersionRaw === null) return FINLIFE_DUMP_SCHEMA_VERSION;
  const schemaVersion = Number(schemaVersionRaw);
  if (!Number.isInteger(schemaVersion) || schemaVersion <= 0) {
    throw new Error(`Invalid finlife dump schemaVersion=${String(schemaVersionRaw)}`);
  }
  return schemaVersion;
}

export function assertSupportedSchemaVersion(schemaVersion) {
  if (SUPPORTED_FINLIFE_DUMP_SCHEMA_VERSIONS.has(schemaVersion)) return;
  throw new Error(
    `Unsupported finlife dump schemaVersion=${schemaVersion} (supported: ${[...SUPPORTED_FINLIFE_DUMP_SCHEMA_VERSIONS].join(", ")}). ` +
    "Please regenerate via --inspect.",
  );
}

export function parseFinlifeDumpPayload(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Invalid finlife dump payload");
  const schemaVersion = detectSchemaVersion(raw);
  assertSupportedSchemaVersion(schemaVersion);
  return {
    schemaVersion,
    meta: raw.meta && typeof raw.meta === "object" ? raw.meta : {},
    products: Array.isArray(raw.products) ? raw.products : [],
  };
}

export function readDumpFile(filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const bytes = fs.readFileSync(absolute);
  const isGzip = absolute.endsWith(".gz");
  const text = isGzip ? zlib.gunzipSync(bytes).toString("utf-8") : bytes.toString("utf-8");
  const parsed = JSON.parse(text);
  const payload = parseFinlifeDumpPayload(parsed);
  return { absolute, payload };
}

export function writeDumpFile(filePath, payload, gzip) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const json = JSON.stringify(payload);
  if (gzip || filePath.endsWith(".gz")) {
    fs.writeFileSync(filePath, zlib.gzipSync(Buffer.from(json, "utf-8")));
    return;
  }
  fs.writeFileSync(filePath, json, "utf-8");
}

