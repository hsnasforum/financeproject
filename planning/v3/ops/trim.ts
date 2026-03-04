import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AlertEventSchema } from "../alerts/contracts";
import { ObservationSchema } from "../indicators/contracts";
import { JournalEntrySchema } from "../journal/contracts";
import { NewsItemSchema } from "../news/contracts";

type TrimSectionSummary = {
  scanned: number;
  candidates: number;
  trimmed: number;
  errors: number;
};

type IndicatorsTrimSummary = TrimSectionSummary & {
  filesRewritten: number;
  filesDeleted: number;
  rowsKept: number;
};

export type V3TrimSummary = {
  mode: "preview" | "apply";
  retentionDays: number;
  cutoffIso: string;
  totals: {
    candidates: number;
    trimmed: number;
    errors: number;
  };
  sections: {
    newsItems: TrimSectionSummary;
    newsDaily: TrimSectionSummary;
    indicatorsSeries: IndicatorsTrimSummary;
    alertsEvents: TrimSectionSummary & { rowsKept: number };
    journalEntries: TrimSectionSummary;
  };
};

type RunV3TrimInput = {
  cwd?: string;
  retentionDays?: number;
  apply?: boolean;
  now?: Date;
};

type ParsedArgs = {
  retentionDays: number;
  apply: boolean;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv: string[]): ParsedArgs {
  let retentionDays = 45;
  let apply = false;

  for (const token of argv) {
    const normalized = asString(token);
    if (!normalized.startsWith("--")) continue;
    if (normalized === "--apply") {
      apply = true;
      continue;
    }
    if (normalized.startsWith("--days=")) {
      const parsed = Number(normalized.slice("--days=".length));
      if (Number.isFinite(parsed)) {
        retentionDays = Math.max(1, Math.min(3650, Math.round(parsed)));
      }
    }
  }

  return {
    retentionDays,
    apply,
  };
}

function safeParseDateMs(value: string): number | null {
  const parsed = Date.parse(asString(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function dayTokenToUtcMs(token: string): number | null {
  const value = asString(token);
  if (!value) return null;

  if (/^\d{4}$/.test(value)) {
    const year = Number(value);
    return Date.UTC(year, 0, 1, 12, 0, 0);
  }

  const quarterMatch = value.match(/^(\d{4})-Q([1-4])$/);
  if (quarterMatch) {
    const year = Number(quarterMatch[1]);
    const quarter = Number(quarterMatch[2]);
    const month = (quarter - 1) * 3;
    return Date.UTC(year, month, 1, 12, 0, 0);
  }

  const monthMatch = value.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const year = Number(monthMatch[1]);
    const month = Number(monthMatch[2]);
    if (month < 1 || month > 12) return null;
    return Date.UTC(year, month - 1, 1, 12, 0, 0);
  }

  const dayMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dayMatch) {
    const year = Number(dayMatch[1]);
    const month = Number(dayMatch[2]);
    const day = Number(dayMatch[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return Date.UTC(year, month - 1, day, 12, 0, 0);
  }

  return null;
}

function isOlderThanCutoff(timestampMs: number | null, cutoffMs: number): boolean {
  return typeof timestampMs === "number" && Number.isFinite(timestampMs) && timestampMs < cutoffMs;
}

function sortedNames(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath).sort((a, b) => a.localeCompare(b));
}

function trimNewsItems(input: {
  rootDir: string;
  cutoffMs: number;
  apply: boolean;
}): TrimSectionSummary {
  const out: TrimSectionSummary = { scanned: 0, candidates: 0, trimmed: 0, errors: 0 };
  const itemsDir = path.join(input.rootDir, ".data", "news", "items");
  if (!fs.existsSync(itemsDir)) return out;

  for (const name of sortedNames(itemsDir).filter((row) => row.endsWith(".json"))) {
    const filePath = path.join(itemsDir, name);
    out.scanned += 1;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
      const item = NewsItemSchema.parse(parsed);
      const ts = safeParseDateMs(item.fetchedAt) ?? safeParseDateMs(item.publishedAt ?? "");
      if (!isOlderThanCutoff(ts, input.cutoffMs)) continue;
      out.candidates += 1;
      if (input.apply) {
        fs.unlinkSync(filePath);
        out.trimmed += 1;
      }
    } catch {
      out.errors += 1;
    }
  }

  return out;
}

function trimNewsDaily(input: {
  rootDir: string;
  cutoffMs: number;
  apply: boolean;
}): TrimSectionSummary {
  const out: TrimSectionSummary = { scanned: 0, candidates: 0, trimmed: 0, errors: 0 };
  const dailyDir = path.join(input.rootDir, ".data", "news", "daily");
  if (!fs.existsSync(dailyDir)) return out;

  for (const name of sortedNames(dailyDir).filter((row) => row.endsWith(".json"))) {
    const filePath = path.join(dailyDir, name);
    out.scanned += 1;
    const dayToken = name.replace(/\.json$/i, "");
    const ts = dayTokenToUtcMs(dayToken);
    if (!isOlderThanCutoff(ts, input.cutoffMs)) continue;
    out.candidates += 1;
    if (input.apply) {
      fs.unlinkSync(filePath);
      out.trimmed += 1;
    }
  }

  return out;
}

function trimIndicatorsSeries(input: {
  rootDir: string;
  cutoffMs: number;
  apply: boolean;
}): IndicatorsTrimSummary {
  const out: IndicatorsTrimSummary = {
    scanned: 0,
    candidates: 0,
    trimmed: 0,
    errors: 0,
    filesRewritten: 0,
    filesDeleted: 0,
    rowsKept: 0,
  };
  const seriesDir = path.join(input.rootDir, ".data", "indicators", "series");
  if (!fs.existsSync(seriesDir)) return out;

  for (const name of sortedNames(seriesDir).filter((row) => row.endsWith(".jsonl"))) {
    const filePath = path.join(seriesDir, name);
    const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
    const kept: string[] = [];
    let candidateRows = 0;
    let scannedRows = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      scannedRows += 1;
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        const row = ObservationSchema.parse(parsed);
        const ts = dayTokenToUtcMs(row.date);
        if (isOlderThanCutoff(ts, input.cutoffMs)) {
          candidateRows += 1;
          continue;
        }
        kept.push(trimmed);
      } catch {
        out.errors += 1;
        kept.push(trimmed);
      }
    }

    out.scanned += scannedRows;
    out.candidates += candidateRows;
    out.rowsKept += kept.length;
    if (!input.apply || candidateRows < 1) continue;

    if (kept.length < 1) {
      fs.unlinkSync(filePath);
      out.filesDeleted += 1;
      out.trimmed += candidateRows;
      continue;
    }

    fs.writeFileSync(filePath, `${kept.join("\n")}\n`, "utf-8");
    out.filesRewritten += 1;
    out.trimmed += candidateRows;
  }

  return out;
}

function trimAlertsEvents(input: {
  rootDir: string;
  cutoffMs: number;
  apply: boolean;
}): TrimSectionSummary & { rowsKept: number } {
  const out: TrimSectionSummary & { rowsKept: number } = {
    scanned: 0,
    candidates: 0,
    trimmed: 0,
    errors: 0,
    rowsKept: 0,
  };
  const filePath = path.join(input.rootDir, ".data", "alerts", "events.jsonl");
  if (!fs.existsSync(filePath)) return out;

  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
  const kept: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    out.scanned += 1;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const row = AlertEventSchema.parse(parsed);
      const ts = dayTokenToUtcMs(row.dayKst) ?? safeParseDateMs(row.createdAt);
      if (isOlderThanCutoff(ts, input.cutoffMs)) {
        out.candidates += 1;
        continue;
      }
      kept.push(trimmed);
    } catch {
      out.errors += 1;
      kept.push(trimmed);
    }
  }

  out.rowsKept = kept.length;
  if (!input.apply || out.candidates < 1) return out;

  if (kept.length < 1) {
    fs.unlinkSync(filePath);
  } else {
    fs.writeFileSync(filePath, `${kept.join("\n")}\n`, "utf-8");
  }
  out.trimmed = out.candidates;
  return out;
}

function trimJournalEntries(input: {
  rootDir: string;
  cutoffMs: number;
  apply: boolean;
}): TrimSectionSummary {
  const out: TrimSectionSummary = { scanned: 0, candidates: 0, trimmed: 0, errors: 0 };
  const entriesDir = path.join(input.rootDir, ".data", "journal", "entries");
  if (!fs.existsSync(entriesDir)) return out;

  for (const name of sortedNames(entriesDir).filter((row) => row.endsWith(".json"))) {
    const filePath = path.join(entriesDir, name);
    out.scanned += 1;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
      const row = JournalEntrySchema.parse(parsed);
      const ts = safeParseDateMs(row.updatedAt) ?? dayTokenToUtcMs(row.date);
      if (!isOlderThanCutoff(ts, input.cutoffMs)) continue;
      out.candidates += 1;
      if (input.apply) {
        fs.unlinkSync(filePath);
        out.trimmed += 1;
      }
    } catch {
      out.errors += 1;
    }
  }

  return out;
}

export function runV3Trim(input: RunV3TrimInput = {}): V3TrimSummary {
  const cwd = input.cwd ?? process.cwd();
  const retentionDays = Math.max(1, Math.min(3650, Math.round(input.retentionDays ?? 45)));
  const apply = input.apply === true;
  const now = input.now ?? new Date();
  const cutoffMs = now.getTime() - (retentionDays * 24 * 60 * 60 * 1000);
  const cutoffIso = new Date(cutoffMs).toISOString();

  const newsItems = trimNewsItems({ rootDir: cwd, cutoffMs, apply });
  const newsDaily = trimNewsDaily({ rootDir: cwd, cutoffMs, apply });
  const indicatorsSeries = trimIndicatorsSeries({ rootDir: cwd, cutoffMs, apply });
  const alertsEvents = trimAlertsEvents({ rootDir: cwd, cutoffMs, apply });
  const journalEntries = trimJournalEntries({ rootDir: cwd, cutoffMs, apply });

  const candidates = newsItems.candidates
    + newsDaily.candidates
    + indicatorsSeries.candidates
    + alertsEvents.candidates
    + journalEntries.candidates;
  const trimmed = newsItems.trimmed
    + newsDaily.trimmed
    + indicatorsSeries.trimmed
    + alertsEvents.trimmed
    + journalEntries.trimmed;
  const errors = newsItems.errors
    + newsDaily.errors
    + indicatorsSeries.errors
    + alertsEvents.errors
    + journalEntries.errors;

  return {
    mode: apply ? "apply" : "preview",
    retentionDays,
    cutoffIso,
    totals: {
      candidates,
      trimmed,
      errors,
    },
    sections: {
      newsItems,
      newsDaily,
      indicatorsSeries,
      alertsEvents,
      journalEntries,
    },
  };
}

function printSummary(summary: V3TrimSummary): void {
  console.log(`[v3:trim] mode=${summary.mode} retentionDays=${summary.retentionDays} cutoff=${summary.cutoffIso}`);
  console.log(`[v3:trim] totals candidates=${summary.totals.candidates} trimmed=${summary.totals.trimmed} errors=${summary.totals.errors}`);

  console.log(`[v3:trim] news.items scanned=${summary.sections.newsItems.scanned} candidates=${summary.sections.newsItems.candidates} trimmed=${summary.sections.newsItems.trimmed} errors=${summary.sections.newsItems.errors}`);
  console.log(`[v3:trim] news.daily scanned=${summary.sections.newsDaily.scanned} candidates=${summary.sections.newsDaily.candidates} trimmed=${summary.sections.newsDaily.trimmed} errors=${summary.sections.newsDaily.errors}`);
  console.log(`[v3:trim] indicators.series rows=${summary.sections.indicatorsSeries.scanned} candidates=${summary.sections.indicatorsSeries.candidates} trimmed=${summary.sections.indicatorsSeries.trimmed} rewritten=${summary.sections.indicatorsSeries.filesRewritten} deletedFiles=${summary.sections.indicatorsSeries.filesDeleted} errors=${summary.sections.indicatorsSeries.errors}`);
  console.log(`[v3:trim] alerts.events rows=${summary.sections.alertsEvents.scanned} candidates=${summary.sections.alertsEvents.candidates} trimmed=${summary.sections.alertsEvents.trimmed} kept=${summary.sections.alertsEvents.rowsKept} errors=${summary.sections.alertsEvents.errors}`);
  console.log(`[v3:trim] journal.entries scanned=${summary.sections.journalEntries.scanned} candidates=${summary.sections.journalEntries.candidates} trimmed=${summary.sections.journalEntries.trimmed} errors=${summary.sections.journalEntries.errors}`);

  if (summary.mode !== "apply") {
    console.log("[v3:trim] preview only. Re-run with --apply to perform deletion.");
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const summary = runV3Trim({
    retentionDays: args.retentionDays,
    apply: args.apply,
  });
  printSummary(summary);
}

const invokedPath = asString(process.argv[1]);
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath && path.resolve(invokedPath) === path.resolve(modulePath)) {
  main();
}
