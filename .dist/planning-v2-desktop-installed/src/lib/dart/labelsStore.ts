import fs from "node:fs";
import path from "node:path";

export const DART_LABELS_HEADER = "corpCode,rceptDt,reportNm,label";
const DEFAULT_LABELS_PATH = path.join(process.cwd(), "data", "dart", "labels.csv");

export type DartLabelInput = {
  corpCode: string;
  rceptDt: string;
  reportNm: string;
  label: string;
};

type DartLabelRow = DartLabelInput;

function resolveLabelsPath(): string {
  const envPath = (process.env.DART_LABELS_PATH ?? "").trim();
  if (envPath) return path.resolve(envPath);
  return DEFAULT_LABELS_PATH;
}

function asString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let token = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const ch = line[index];
    const next = line[index + 1];

    if (ch === "\"") {
      if (quoted && next === "\"") {
        token += "\"";
        index += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }

    if (ch === "," && !quoted) {
      out.push(token);
      token = "";
      continue;
    }

    token += ch;
  }

  out.push(token);
  return out;
}

function csvEscape(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function toCsvLine(row: DartLabelRow): string {
  return [
    csvEscape(row.corpCode),
    csvEscape(row.rceptDt),
    csvEscape(row.reportNm),
    csvEscape(row.label),
  ].join(",");
}

function normalizeRow(row: Partial<DartLabelRow>): DartLabelRow | null {
  const corpCode = asString(row.corpCode);
  const rceptDt = asString(row.rceptDt);
  const reportNm = asString(row.reportNm);
  const label = asString(row.label);
  if (!corpCode || !rceptDt || !reportNm || !label) return null;
  return {
    corpCode,
    rceptDt,
    reportNm,
    label,
  };
}

function ensureFile(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${DART_LABELS_HEADER}\n`, "utf-8");
    return;
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  if (raw.trim().length === 0) {
    fs.writeFileSync(filePath, `${DART_LABELS_HEADER}\n`, "utf-8");
  }
}

export function labelKeyOf(input: Pick<DartLabelInput, "corpCode" | "rceptDt" | "reportNm">): string {
  const corpCode = asString(input.corpCode);
  const rceptDt = asString(input.rceptDt);
  const reportNm = asString(input.reportNm);
  return `${corpCode}|${rceptDt}|${reportNm}`;
}

function readRows(filePath = resolveLabelsPath()): DartLabelRow[] {
  ensureFile(filePath);
  const raw = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header) => asString(header));
  const indices = {
    corpCode: headers.indexOf("corpCode"),
    rceptDt: headers.indexOf("rceptDt"),
    reportNm: headers.indexOf("reportNm"),
    label: headers.indexOf("label"),
  };
  if (indices.corpCode < 0 || indices.rceptDt < 0 || indices.reportNm < 0 || indices.label < 0) {
    return [];
  }

  const bestByKey = new Map<string, DartLabelRow>();
  for (let index = 1; index < lines.length; index += 1) {
    const cols = parseCsvLine(lines[index]);
    const next = normalizeRow({
      corpCode: cols[indices.corpCode],
      rceptDt: cols[indices.rceptDt],
      reportNm: cols[indices.reportNm],
      label: cols[indices.label],
    });
    if (!next) continue;
    bestByKey.set(labelKeyOf(next), next);
  }

  return [...bestByKey.values()].sort((a, b) => {
    const corpDiff = a.corpCode.localeCompare(b.corpCode);
    if (corpDiff !== 0) return corpDiff;
    const dateDiff = b.rceptDt.localeCompare(a.rceptDt);
    if (dateDiff !== 0) return dateDiff;
    return a.reportNm.localeCompare(b.reportNm);
  });
}

function writeRows(rows: DartLabelRow[], filePath = resolveLabelsPath()): void {
  ensureFile(filePath);
  const tmpPath = `${filePath}.tmp`;
  const lines = [DART_LABELS_HEADER, ...rows.map((row) => toCsvLine(row))];
  fs.writeFileSync(tmpPath, `${lines.join("\n")}\n`, "utf-8");
  fs.renameSync(tmpPath, filePath);
}

export function loadLabels(): Map<string, string> {
  const rows = readRows();
  const out = new Map<string, string>();
  for (const row of rows) {
    out.set(labelKeyOf(row), row.label);
  }
  return out;
}

export function upsertLabel(input: DartLabelInput): DartLabelRow {
  const normalized = normalizeRow(input);
  if (!normalized) {
    throw new Error("invalid label input");
  }

  const rows = readRows();
  const key = labelKeyOf(normalized);
  const index = rows.findIndex((row) => labelKeyOf(row) === key);
  if (index >= 0) {
    rows[index] = normalized;
  } else {
    rows.push(normalized);
  }
  writeRows(rows);
  return normalized;
}
