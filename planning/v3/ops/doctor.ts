import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { AlertEventSchema } from "../alerts/contracts";
import { IndicatorsStateSchema, ObservationSchema, SeriesSnapshotMetaSchema } from "../indicators/contracts";
import { JournalEntrySchema } from "../journal/contracts";
import { NewsItemSchema, RuntimeStateSchema, TopicDailyStatSchema } from "../news/contracts";

type IssueLevel = "error" | "warning";

type DoctorIssue = {
  level: IssueLevel;
  check: string;
  path: string;
  code: string;
  message: string;
};

type CheckSummary = {
  check: string;
  files: number;
  errors: number;
  warnings: number;
};

type V3DoctorReport = {
  ok: boolean;
  checkedAt: string;
  counts: {
    checks: number;
    files: number;
    errors: number;
    warnings: number;
  };
  summaries: CheckSummary[];
  issues: DoctorIssue[];
};

type CheckAccumulator = {
  files: number;
  errors: number;
  warnings: number;
};

const OBS_DATE_REGEX = /^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?|-(?:Q[1-4]))?$/;

const SeriesMetaFileSchema = z.object({
  seriesId: z.string().trim().min(1),
  asOf: z.string().datetime(),
  meta: SeriesSnapshotMetaSchema,
  observations: z.object({
    count: z.number().int().nonnegative(),
    firstDate: z.string().trim().regex(OBS_DATE_REGEX).optional(),
    lastDate: z.string().trim().regex(OBS_DATE_REGEX).optional(),
  }),
});

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function relativeToCwd(filePath: string, cwd: string): string {
  const rel = path.relative(cwd, filePath);
  return rel && !rel.startsWith("..") ? rel : filePath;
}

function sortedNames(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath).sort((a, b) => a.localeCompare(b));
}

function makeAccumulator(): CheckAccumulator {
  return {
    files: 0,
    errors: 0,
    warnings: 0,
  };
}

function recordIssue(list: DoctorIssue[], acc: CheckAccumulator, issue: DoctorIssue): void {
  list.push(issue);
  if (issue.level === "error") {
    acc.errors += 1;
  } else {
    acc.warnings += 1;
  }
}

function parseJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
}

function parseJsonLines(filePath: string): unknown[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.map((line) => JSON.parse(line) as unknown);
}

function runNewsChecks(dataRoot: string, cwd: string, issues: DoctorIssue[]): CheckSummary[] {
  const summaries: CheckSummary[] = [];
  const newsRoot = path.join(dataRoot, "news");

  const itemsAcc = makeAccumulator();
  const itemsDir = path.join(newsRoot, "items");
  if (!fs.existsSync(itemsDir)) {
    recordIssue(issues, itemsAcc, {
      level: "warning",
      check: "news.items",
      path: relativeToCwd(itemsDir, cwd),
      code: "DIR_MISSING",
      message: "뉴스 items 디렉터리가 없습니다.",
    });
  } else {
    for (const name of sortedNames(itemsDir).filter((row) => row.endsWith(".json"))) {
      const filePath = path.join(itemsDir, name);
      itemsAcc.files += 1;
      try {
        NewsItemSchema.parse(parseJsonFile(filePath));
      } catch {
        recordIssue(issues, itemsAcc, {
          level: "error",
          check: "news.items",
          path: relativeToCwd(filePath, cwd),
          code: "SCHEMA_INVALID",
          message: "NewsItem 스키마 검증 실패",
        });
      }
    }
  }
  summaries.push({ check: "news.items", ...itemsAcc });

  const stateAcc = makeAccumulator();
  const statePath = path.join(newsRoot, "state.json");
  if (!fs.existsSync(statePath)) {
    recordIssue(issues, stateAcc, {
      level: "warning",
      check: "news.state",
      path: relativeToCwd(statePath, cwd),
      code: "FILE_MISSING",
      message: "뉴스 state.json 파일이 없습니다.",
    });
  } else {
    stateAcc.files += 1;
    try {
      RuntimeStateSchema.parse(parseJsonFile(statePath));
    } catch {
      recordIssue(issues, stateAcc, {
        level: "error",
        check: "news.state",
        path: relativeToCwd(statePath, cwd),
        code: "SCHEMA_INVALID",
        message: "RuntimeState 스키마 검증 실패",
      });
    }
  }
  summaries.push({ check: "news.state", ...stateAcc });

  const dailyAcc = makeAccumulator();
  const dailyDir = path.join(newsRoot, "daily");
  if (!fs.existsSync(dailyDir)) {
    recordIssue(issues, dailyAcc, {
      level: "warning",
      check: "news.daily",
      path: relativeToCwd(dailyDir, cwd),
      code: "DIR_MISSING",
      message: "뉴스 daily 디렉터리가 없습니다.",
    });
  } else {
    for (const name of sortedNames(dailyDir).filter((row) => row.endsWith(".json"))) {
      const filePath = path.join(dailyDir, name);
      dailyAcc.files += 1;
      try {
        const parsed = parseJsonFile(filePath);
        if (!Array.isArray(parsed)) {
          throw new Error("array_expected");
        }
        for (const row of parsed) {
          TopicDailyStatSchema.parse(row);
        }
      } catch {
        recordIssue(issues, dailyAcc, {
          level: "error",
          check: "news.daily",
          path: relativeToCwd(filePath, cwd),
          code: "SCHEMA_INVALID",
          message: "TopicDailyStat 배열 스키마 검증 실패",
        });
      }
    }
  }
  summaries.push({ check: "news.daily", ...dailyAcc });

  return summaries;
}

function runIndicatorsChecks(dataRoot: string, cwd: string, issues: DoctorIssue[]): CheckSummary[] {
  const summaries: CheckSummary[] = [];
  const indicatorsRoot = path.join(dataRoot, "indicators");

  const seriesAcc = makeAccumulator();
  const seriesDir = path.join(indicatorsRoot, "series");
  if (!fs.existsSync(seriesDir)) {
    recordIssue(issues, seriesAcc, {
      level: "warning",
      check: "indicators.series",
      path: relativeToCwd(seriesDir, cwd),
      code: "DIR_MISSING",
      message: "지표 series 디렉터리가 없습니다.",
    });
  } else {
    for (const name of sortedNames(seriesDir).filter((row) => row.endsWith(".jsonl"))) {
      const filePath = path.join(seriesDir, name);
      seriesAcc.files += 1;
      try {
        const rows = parseJsonLines(filePath);
        for (const row of rows) {
          ObservationSchema.parse(row);
        }
      } catch {
        recordIssue(issues, seriesAcc, {
          level: "error",
          check: "indicators.series",
          path: relativeToCwd(filePath, cwd),
          code: "SCHEMA_INVALID",
          message: "Observation jsonl 스키마 검증 실패",
        });
      }
    }
  }
  summaries.push({ check: "indicators.series", ...seriesAcc });

  const metaAcc = makeAccumulator();
  const metaDir = path.join(indicatorsRoot, "meta");
  if (!fs.existsSync(metaDir)) {
    recordIssue(issues, metaAcc, {
      level: "warning",
      check: "indicators.meta",
      path: relativeToCwd(metaDir, cwd),
      code: "DIR_MISSING",
      message: "지표 meta 디렉터리가 없습니다.",
    });
  } else {
    for (const name of sortedNames(metaDir).filter((row) => row.endsWith(".json"))) {
      const filePath = path.join(metaDir, name);
      metaAcc.files += 1;
      try {
        SeriesMetaFileSchema.parse(parseJsonFile(filePath));
      } catch {
        recordIssue(issues, metaAcc, {
          level: "error",
          check: "indicators.meta",
          path: relativeToCwd(filePath, cwd),
          code: "SCHEMA_INVALID",
          message: "Series meta 스키마 검증 실패",
        });
      }
    }
  }
  summaries.push({ check: "indicators.meta", ...metaAcc });

  const stateAcc = makeAccumulator();
  const statePath = path.join(indicatorsRoot, "state.json");
  if (!fs.existsSync(statePath)) {
    recordIssue(issues, stateAcc, {
      level: "warning",
      check: "indicators.state",
      path: relativeToCwd(statePath, cwd),
      code: "FILE_MISSING",
      message: "지표 state.json 파일이 없습니다.",
    });
  } else {
    stateAcc.files += 1;
    try {
      IndicatorsStateSchema.parse(parseJsonFile(statePath));
    } catch {
      recordIssue(issues, stateAcc, {
        level: "error",
        check: "indicators.state",
        path: relativeToCwd(statePath, cwd),
        code: "SCHEMA_INVALID",
        message: "IndicatorsState 스키마 검증 실패",
      });
    }
  }
  summaries.push({ check: "indicators.state", ...stateAcc });

  return summaries;
}

function runAlertsChecks(dataRoot: string, cwd: string, issues: DoctorIssue[]): CheckSummary[] {
  const summaries: CheckSummary[] = [];
  const acc = makeAccumulator();
  const eventsPath = path.join(dataRoot, "alerts", "events.jsonl");

  if (!fs.existsSync(eventsPath)) {
    recordIssue(issues, acc, {
      level: "warning",
      check: "alerts.events",
      path: relativeToCwd(eventsPath, cwd),
      code: "FILE_MISSING",
      message: "알림 events.jsonl 파일이 없습니다.",
    });
  } else {
    acc.files += 1;
    try {
      const rows = parseJsonLines(eventsPath);
      for (const row of rows) {
        AlertEventSchema.parse(row);
      }
    } catch {
      recordIssue(issues, acc, {
        level: "error",
        check: "alerts.events",
        path: relativeToCwd(eventsPath, cwd),
        code: "SCHEMA_INVALID",
        message: "AlertEvent jsonl 스키마 검증 실패",
      });
    }
  }

  summaries.push({ check: "alerts.events", ...acc });
  return summaries;
}

function runJournalChecks(dataRoot: string, cwd: string, issues: DoctorIssue[]): CheckSummary[] {
  const summaries: CheckSummary[] = [];
  const acc = makeAccumulator();
  const entriesDir = path.join(dataRoot, "journal", "entries");

  if (!fs.existsSync(entriesDir)) {
    recordIssue(issues, acc, {
      level: "warning",
      check: "journal.entries",
      path: relativeToCwd(entriesDir, cwd),
      code: "DIR_MISSING",
      message: "저널 entries 디렉터리가 없습니다.",
    });
  } else {
    for (const name of sortedNames(entriesDir).filter((row) => row.endsWith(".json"))) {
      const filePath = path.join(entriesDir, name);
      acc.files += 1;
      try {
        JournalEntrySchema.parse(parseJsonFile(filePath));
      } catch {
        recordIssue(issues, acc, {
          level: "error",
          check: "journal.entries",
          path: relativeToCwd(filePath, cwd),
          code: "SCHEMA_INVALID",
          message: "JournalEntry 스키마 검증 실패",
        });
      }
    }
  }

  summaries.push({ check: "journal.entries", ...acc });
  return summaries;
}

export function runV3Doctor(input: { cwd?: string } = {}): V3DoctorReport {
  const cwd = input.cwd ?? process.cwd();
  const dataRoot = path.join(cwd, ".data");
  const issues: DoctorIssue[] = [];

  const summaries = [
    ...runNewsChecks(dataRoot, cwd, issues),
    ...runIndicatorsChecks(dataRoot, cwd, issues),
    ...runAlertsChecks(dataRoot, cwd, issues),
    ...runJournalChecks(dataRoot, cwd, issues),
  ];

  const errors = summaries.reduce((sum, row) => sum + row.errors, 0);
  const warnings = summaries.reduce((sum, row) => sum + row.warnings, 0);
  const files = summaries.reduce((sum, row) => sum + row.files, 0);

  return {
    ok: errors < 1,
    checkedAt: new Date().toISOString(),
    counts: {
      checks: summaries.length,
      files,
      errors,
      warnings,
    },
    summaries,
    issues: issues.sort((a, b) => {
      if (a.level !== b.level) return a.level === "error" ? -1 : 1;
      if (a.check !== b.check) return a.check.localeCompare(b.check);
      return a.path.localeCompare(b.path);
    }),
  };
}

function printReport(report: V3DoctorReport): void {
  console.log(`[v3:doctor] ok=${report.ok} checks=${report.counts.checks} files=${report.counts.files} errors=${report.counts.errors} warnings=${report.counts.warnings}`);
  for (const row of report.summaries) {
    console.log(`[v3:doctor] ${row.check}: files=${row.files} errors=${row.errors} warnings=${row.warnings}`);
  }

  if (report.issues.length > 0) {
    console.log(`[v3:doctor] issues=${report.issues.length}`);
    for (const issue of report.issues) {
      console.log(`[v3:doctor][${issue.level.toUpperCase()}] ${issue.check} ${issue.code} ${issue.path} :: ${issue.message}`);
    }
  }
}

function main(): void {
  const report = runV3Doctor();
  printReport(report);
  if (!report.ok) {
    process.exitCode = 1;
  }
}

const invokedPath = asString(process.argv[1]);
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath && path.resolve(invokedPath) === path.resolve(modulePath)) {
  main();
}
