import { assertSameOrigin, toGuardErrorResponse } from "../../../../lib/dev/devGuards";
import { jsonError, jsonOk } from "../../../../lib/http/apiResponse";
import {
  DEFAULT_INTEREST_TAX_POLICY,
  deriveDefaultComparisonAmountKrw,
  deriveDefaultComparisonTermMonths,
  type CandidateGoalContext,
  type CandidateKind,
  type CandidateProfileContext,
  type CandidateVM,
} from "../../../../lib/planning/candidates/comparison";
import { getProfile } from "../../../../lib/planning/server/store/profileStore";
import { getRun } from "../../../../lib/planning/server/store/runStore";
import { getUnifiedProducts, UnifiedInputError, type UnifiedProductView } from "../../../../lib/sources/unified";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const raw = asFiniteNumber(value);
  if (raw === null) return fallback;
  const normalized = Math.trunc(raw);
  return Math.max(min, Math.min(max, normalized));
}

function withReadGuard(request: Request) {
  try {
    assertSameOrigin(request);
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

function normalizeKind(value: string): "all" | CandidateKind {
  const normalized = value.trim().toLowerCase();
  if (normalized === "deposit" || normalized === "saving") return normalized;
  return "all";
}

function normalizeCandidateRows(
  kind: CandidateKind,
  items: UnifiedProductView[],
  fetchedAt: string,
): CandidateVM[] {
  const rows: CandidateVM[] = [];
  const seenIds = new Set<string>();

  for (const item of items) {
    const providerName = asString(item.providerName) || "-";
    const productName = asString(item.productName) || "-";
    const summary = asString(item.summary);
    const badges = Array.isArray(item.badges) ? item.badges.map((entry) => asString(entry)).filter((entry) => entry.length > 0) : [];
    const baseId = asString(item.stableId) || asString(item.externalKey) || `${providerName}:${productName}`;
    const options = Array.isArray(item.options) && item.options.length > 0
      ? item.options
      : [{ sourceId: item.sourceId, termMonths: null, intrRate: null, intrRate2: null }];

    options.forEach((option, optionIndex) => {
      const baseRate = asFiniteNumber(option.intrRate ?? option.intrRate2);
      if (baseRate === null) return;
      const termRaw = asFiniteNumber(option.termMonths);
      const termMonths = termRaw === null ? null : Math.max(1, Math.trunc(termRaw));
      const maxRate = asFiniteNumber(option.intrRate2);
      const minRate = asFiniteNumber(option.intrRate);
      const bonusRatePct = (maxRate !== null && minRate !== null && maxRate > minRate)
        ? Number((maxRate - minRate).toFixed(4))
        : undefined;
      const source = asString(option.sourceId) || asString(item.sourceId) || "finlife";
      const candidateId = `${baseId}:${termMonths ?? "na"}:${source}:${optionIndex}`;
      if (seenIds.has(candidateId)) return;
      seenIds.add(candidateId);

      rows.push({
        id: candidateId,
        kind,
        providerName,
        productName,
        termMonths,
        baseRatePct: Number(baseRate.toFixed(4)),
        ...(typeof bonusRatePct === "number" ? { bonusRatePct } : {}),
        conditionsSummary: summary || badges.join(", ") || "우대조건/가입조건은 상품 상세에서 확인하세요.",
        source,
        fetchedAt,
      });
    });
  }

  return rows;
}

function isCatalogUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const codeValue = (error as Error & { code?: unknown }).code;
  const code = typeof codeValue === "string" ? codeValue : "";
  if (code === "P2021" || code === "P1003") return true;

  const message = error.message.toLowerCase();
  return message.includes("the table `main.product` does not exist")
    || message.includes("the table `main.externalproduct` does not exist")
    || message.includes("the table `main.externalsourcesnapshot` does not exist")
    || message.includes("does not exist in the current database");
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function fetchCandidatesByKind(kind: CandidateKind, q: string, limit: number, fetchedAt: string): Promise<CandidateVM[]> {
  const data = await getUnifiedProducts({
    kind,
    mode: "merged",
    includeSources: ["finlife"],
    sourceId: "finlife",
    cursor: null,
    q: q || null,
    refresh: false,
    onlyNew: false,
    changedSince: null,
    includeTimestamps: false,
    limit,
    sort: "recent",
    qMode: "contains",
    debug: false,
  });
  return normalizeCandidateRows(kind, data.items, fetchedAt);
}

export async function GET(request: Request) {
  const guardFailure = withReadGuard(request);
  if (guardFailure) return guardFailure;

  try {
    const url = new URL(request.url);
    const runId = asString(url.searchParams.get("runId"));
    if (!runId) {
      return jsonError("INPUT", "runId가 필요합니다.", {
        status: 400,
        issues: ["runId: required"],
      });
    }

    const run = await getRun(runId);
    if (!run) {
      return jsonError("NO_DATA", "실행 기록을 찾을 수 없습니다.", { status: 404 });
    }

    const profileRecord = await getProfile(run.profileId);
    if (!profileRecord) {
      return jsonError("NO_DATA", "실행 기록에 연결된 프로필을 찾을 수 없습니다.", { status: 404 });
    }

    const kind = normalizeKind(asString(url.searchParams.get("kind")));
    const q = asString(url.searchParams.get("q"));
    const limit = clampInt(url.searchParams.get("limit"), 60, 1, 200);
    const fetchedAt = new Date().toISOString();

    const kinds: CandidateKind[] = kind === "all" ? ["deposit", "saving"] : [kind];
    let candidates: CandidateVM[] = [];
    let degradedReason = "";
    try {
      const rowsByKind = await Promise.all(
        kinds.map(async (targetKind) => fetchCandidatesByKind(targetKind, q, limit, fetchedAt)),
      );
      candidates = rowsByKind.flat().slice(0, limit);
    } catch (error) {
      if (!isCatalogUnavailableError(error)) {
        throw error;
      }
      degradedReason = "PRODUCT_CATALOG_UNAVAILABLE";
      console.warn("[products/candidates] catalog unavailable; returning empty candidates", {
        runId,
        kind,
        reason: toErrorMessage(error, "unknown"),
      });
    }

    const profileContext: CandidateProfileContext = {
      monthlyIncomeNet: profileRecord.profile.monthlyIncomeNet,
      monthlyEssentialExpenses: profileRecord.profile.monthlyEssentialExpenses,
      monthlyDiscretionaryExpenses: profileRecord.profile.monthlyDiscretionaryExpenses,
      liquidAssets: profileRecord.profile.liquidAssets,
    };
    const goals: CandidateGoalContext[] = profileRecord.profile.goals.map((goal) => ({
      id: goal.id,
      name: goal.name,
      targetAmount: goal.targetAmount,
      ...(typeof goal.currentAmount === "number" ? { currentAmount: goal.currentAmount } : {}),
      ...(typeof goal.targetMonth === "number" ? { targetMonth: goal.targetMonth } : {}),
      ...(typeof goal.priority === "number" ? { priority: goal.priority } : {}),
    }));
    const primaryGoal = goals
      .filter((goal) => typeof goal.targetMonth === "number" && goal.targetMonth > 0)
      .sort((a, b) => (a.targetMonth ?? 0) - (b.targetMonth ?? 0))[0] ?? goals[0];

    return jsonOk({
      data: {
        runId: run.id,
        profileId: run.profileId,
        kind,
        candidates,
        profileContext,
        goals,
        defaults: {
          amountKrw: deriveDefaultComparisonAmountKrw(profileContext, primaryGoal),
          termMonths: deriveDefaultComparisonTermMonths(primaryGoal),
          taxRatePct: DEFAULT_INTEREST_TAX_POLICY.taxRatePct,
        },
        fetchedAt,
      },
    }, degradedReason
      ? {
          meta: {
            degradedReason,
          },
        }
      : undefined);
  } catch (error) {
    if (error instanceof UnifiedInputError) {
      return jsonError("INPUT", error.message, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "후보 비교 데이터를 불러오지 못했습니다.";
    return jsonError("INTERNAL", message, { status: 500 });
  }
}
