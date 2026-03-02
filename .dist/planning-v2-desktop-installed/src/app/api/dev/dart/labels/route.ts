import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { loadRules } from "@/lib/dart/disclosureClassifier";
import { labelKeyOf, loadLabels, upsertLabel } from "@/lib/dart/labelsStore";
import { suggestLabel, type LabelSuggestion } from "@/lib/dart/labelSuggest";

const CORPUS_PATH = path.join(process.cwd(), "tmp", "dart", "disclosure_corpus.json");
const RULES_PATH = path.join(process.cwd(), "config", "dart-disclosure-rules.json");

type LabelBody = {
  corpCode?: unknown;
  rceptDt?: unknown;
  reportNm?: unknown;
  label?: unknown;
  csrf?: unknown;
} | null;

type CorpusItem = {
  corpCode: string;
  corpName: string;
  rceptDt: string;
  reportNm: string;
  rceptNo?: string;
};

function asString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeCorpusRow(row: unknown): CorpusItem | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const value = row as Record<string, unknown>;
  const corpCode = asString(value.corpCode ?? value.corp_code);
  const corpName = asString(value.corpName ?? value.corp_name) || corpCode;
  const rceptDt = asString(value.rceptDt ?? value.rcept_dt ?? value.receiptDate ?? value.date);
  const reportNm = asString(value.reportNm ?? value.report_nm ?? value.reportName ?? value.title);
  const rceptNo = asString(value.rceptNo ?? value.rcept_no ?? value.receiptNo ?? value.receipt_no);
  if (!corpCode || !rceptDt || !reportNm) return null;
  if (rceptNo) {
    return { corpCode, corpName, rceptDt, reportNm, rceptNo };
  }
  return { corpCode, corpName, rceptDt, reportNm };
}

function readCorpusItems(): CorpusItem[] {
  if (!fs.existsSync(CORPUS_PATH)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(CORPUS_PATH, "utf-8")) as unknown;
    const rows = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown[] }).items)
        ? (parsed as { items: unknown[] }).items
        : [];

    const deduped = new Map<string, CorpusItem>();
    for (const row of rows) {
      const normalized = normalizeCorpusRow(row);
      if (!normalized) continue;
      const key = labelKeyOf(normalized);
      if (deduped.has(key)) continue;
      deduped.set(key, normalized);
    }

    return [...deduped.values()].sort((a, b) => {
      const dateDiff = b.rceptDt.localeCompare(a.rceptDt);
      if (dateDiff !== 0) return dateDiff;
      const corpDiff = a.corpCode.localeCompare(b.corpCode);
      if (corpDiff !== 0) return corpDiff;
      return a.reportNm.localeCompare(b.reportNm);
    });
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const url = new URL(request.url);
  const mode = asString(url.searchParams.get("mode")) || "all";
  const queueMode = mode === "queue";

  const corpusItems = readCorpusItems();
  const labels = loadLabels();

  let categories: Array<{ id: string; label: string }> = [];
  let suggestItem: ((reportNm: string) => LabelSuggestion) | null = null;
  try {
    const rules = loadRules(RULES_PATH);
    categories = rules.categories.map((category) => ({
      id: category.id,
      label: category.label,
    }));
    suggestItem = (reportNm: string) => suggestLabel({ reportNm }, rules);
  } catch {
    categories = [];
    suggestItem = null;
  }

  const withLabels = corpusItems.map((item) => {
    const key = labelKeyOf(item);
    const label = labels.get(key) ?? null;
    const suggestion = suggestItem
      ? suggestItem(item.reportNm)
      : {
        predictedCategoryId: null,
        score: 0,
        level: null,
        signals: [],
        uncertain: false,
        unknown: false,
        threshold: 0,
        normalizedTitle: "",
        noiseFlags: [],
        tokenCount: 0,
      };
    return {
      key,
      ...item,
      label,
      suggestion,
    };
  });

  const labeledCount = withLabels.filter((item) => item.label !== null).length;
  const unlabeledCount = withLabels.length - labeledCount;
  const items = queueMode
    ? withLabels
      .filter((item) => item.label === null)
      .sort((a, b) => {
        const uncertainDiff = Number(Boolean(b.suggestion?.uncertain)) - Number(Boolean(a.suggestion?.uncertain));
        if (uncertainDiff !== 0) return uncertainDiff;
        const scoreA = Number.isFinite(a.suggestion?.score) ? Number(a.suggestion?.score) : 101;
        const scoreB = Number.isFinite(b.suggestion?.score) ? Number(b.suggestion?.score) : 101;
        if (scoreA !== scoreB) return scoreA - scoreB;
        const dateDiff = b.rceptDt.localeCompare(a.rceptDt);
        if (dateDiff !== 0) return dateDiff;
        return a.key.localeCompare(b.key);
      })
    : withLabels;

  return NextResponse.json({
    ok: true,
    data: {
      mode: queueMode ? "queue" : "all",
      total: withLabels.length,
      labeledCount,
      unlabeledCount,
      categories,
      items,
    },
  });
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: LabelBody = null;
  try {
    body = (await request.json()) as LabelBody;
  } catch {
    body = null;
  }

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, body);
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "INTERNAL", message: "요청 검증 중 오류가 발생했습니다." },
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: { code: guard.code, message: guard.message },
      },
      { status: guard.status },
    );
  }

  const corpCode = asString(body?.corpCode);
  const rceptDt = asString(body?.rceptDt);
  const reportNm = asString(body?.reportNm);
  const label = asString(body?.label);
  if (!corpCode || !rceptDt || !reportNm || !label) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INVALID_INPUT", message: "corpCode, rceptDt, reportNm, label이 필요합니다." },
      },
      { status: 400 },
    );
  }

  let allowedLabels: Set<string>;
  try {
    const rules = loadRules(RULES_PATH);
    allowedLabels = new Set(rules.categories.map((category) => category.id));
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "RULES_LOAD_FAILED",
          message: error instanceof Error ? error.message : "rules 로드에 실패했습니다.",
        },
      },
      { status: 500 },
    );
  }

  if (!allowedLabels.has(label)) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INVALID_LABEL", message: "rules categories id에 없는 label입니다." },
      },
      { status: 400 },
    );
  }

  try {
    const saved = upsertLabel({
      corpCode,
      rceptDt,
      reportNm,
      label,
    });
    return NextResponse.json({
      ok: true,
      data: {
        key: labelKeyOf(saved),
        ...saved,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SAVE_FAILED",
          message: error instanceof Error ? error.message : "라벨 저장에 실패했습니다.",
        },
      },
      { status: 500 },
    );
  }
}
