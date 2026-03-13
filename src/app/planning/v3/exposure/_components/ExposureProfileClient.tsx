"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import {
  reportHeroActionLinkClassName,
  reportHeroPrimaryActionClassName,
  ReportHeroCard,
  ReportHeroStatCard,
  ReportHeroStatGrid,
} from "@/components/ui/ReportTone";
import { withDevCsrf } from "@/lib/dev/clientCsrf";

type ExposureProfileClientProps = {
  csrf?: string;
};

type ExposureDraft = {
  hasDebt: "yes" | "no" | "unknown";
  rateType: "fixed" | "variable" | "mixed" | "none" | "unknown";
  repricingHorizon: "short" | "medium" | "long" | "none" | "unknown";
  essentialExpenseShare: "low" | "medium" | "high" | "unknown";
  rentOrMortgageShare: "low" | "medium" | "high" | "unknown";
  energyShare: "low" | "medium" | "high" | "unknown";
  foreignConsumption: "low" | "medium" | "high" | "unknown";
  foreignIncome: "low" | "medium" | "high" | "unknown";
  incomeStability: "stable" | "moderate" | "fragile" | "unknown";
  monthsOfCashBuffer: "low" | "medium" | "high" | "unknown";
};

type ExposureProfile = {
  savedAt?: string;
  debt?: {
    hasDebt?: ExposureDraft["hasDebt"];
    rateType?: ExposureDraft["rateType"];
    repricingHorizon?: ExposureDraft["repricingHorizon"];
  };
  inflation?: {
    essentialExpenseShare?: ExposureDraft["essentialExpenseShare"];
    rentOrMortgageShare?: ExposureDraft["rentOrMortgageShare"];
    energyShare?: ExposureDraft["energyShare"];
  };
  fx?: {
    foreignConsumption?: ExposureDraft["foreignConsumption"];
    foreignIncome?: ExposureDraft["foreignIncome"];
  };
  income?: {
    incomeStability?: ExposureDraft["incomeStability"];
  };
  liquidity?: {
    monthsOfCashBuffer?: ExposureDraft["monthsOfCashBuffer"];
  };
};

type ExposureResponse = {
  ok?: boolean;
  profile?: ExposureProfile | null;
  error?: {
    message?: string;
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDateTime(value: string | null | undefined): string {
  const parsed = Date.parse(asString(value));
  if (!Number.isFinite(parsed)) return "-";
  return new Date(parsed).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function defaultDraft(): ExposureDraft {
  return {
    hasDebt: "unknown",
    rateType: "unknown",
    repricingHorizon: "unknown",
    essentialExpenseShare: "unknown",
    rentOrMortgageShare: "unknown",
    energyShare: "unknown",
    foreignConsumption: "unknown",
    foreignIncome: "unknown",
    incomeStability: "unknown",
    monthsOfCashBuffer: "unknown",
  };
}

const EXPOSURE_KEYS: Array<keyof ExposureDraft> = [
  "hasDebt",
  "rateType",
  "repricingHorizon",
  "essentialExpenseShare",
  "rentOrMortgageShare",
  "energyShare",
  "foreignConsumption",
  "foreignIncome",
  "incomeStability",
  "monthsOfCashBuffer",
];

function countCompletedFields(draft: ExposureDraft): number {
  return EXPOSURE_KEYS.filter((key) => draft[key] !== "unknown").length;
}

function labelValue(value: string): string {
  const map: Record<string, string> = {
    yes: "있음",
    no: "없음",
    unknown: "미입력",
    fixed: "고정",
    variable: "변동",
    mixed: "혼합",
    none: "해당 없음",
    short: "단기",
    medium: "중간",
    long: "장기",
    low: "낮음",
    high: "높음",
    stable: "안정",
    moderate: "보통",
    fragile: "취약",
  };
  return map[value] ?? value;
}

function summarizeDebtSensitivity(draft: ExposureDraft): string {
  if (draft.hasDebt === "no") return "부채 없음";
  if (draft.hasDebt === "unknown") return "확인 필요";
  if (draft.rateType === "variable" || draft.repricingHorizon === "short") return "금리 변동에 민감";
  if (draft.rateType === "mixed") return "금리 혼합형";
  if (draft.rateType === "fixed") return "금리 변동 영향 제한적";
  return "부채 구조 확인 필요";
}

function summarizeLivingCost(draft: ExposureDraft): string {
  const highCost = [draft.essentialExpenseShare, draft.rentOrMortgageShare, draft.energyShare].filter((value) => value === "high").length;
  if (highCost >= 2) return "생활비 압박 높음";
  if (highCost === 1) return "생활비 압박 보통";
  if ([draft.essentialExpenseShare, draft.rentOrMortgageShare, draft.energyShare].every((value) => value === "low")) return "생활비 압박 낮음";
  return "지출 구조 확인 필요";
}

function summarizeFxIncome(draft: ExposureDraft): string {
  if (draft.foreignConsumption === "high" || draft.foreignIncome === "high") return "환율 노출 큼";
  if (draft.foreignConsumption === "low" && draft.foreignIncome === "low") return "환율 노출 낮음";
  if (draft.incomeStability === "fragile") return "소득 변동성 주의";
  return "환율/소득 보통";
}

function summarizeLiquidity(draft: ExposureDraft): string {
  if (draft.monthsOfCashBuffer === "high") return "완충력 여유";
  if (draft.monthsOfCashBuffer === "medium") return "완충력 보통";
  if (draft.monthsOfCashBuffer === "low") return "현금 완충 보강 필요";
  return "완충력 미입력";
}

function profileToDraft(profile: ExposureProfile | null | undefined): ExposureDraft {
  const base = defaultDraft();
  if (!profile) return base;
  return {
    hasDebt: profile.debt?.hasDebt ?? base.hasDebt,
    rateType: profile.debt?.rateType ?? base.rateType,
    repricingHorizon: profile.debt?.repricingHorizon ?? base.repricingHorizon,
    essentialExpenseShare: profile.inflation?.essentialExpenseShare ?? base.essentialExpenseShare,
    rentOrMortgageShare: profile.inflation?.rentOrMortgageShare ?? base.rentOrMortgageShare,
    energyShare: profile.inflation?.energyShare ?? base.energyShare,
    foreignConsumption: profile.fx?.foreignConsumption ?? base.foreignConsumption,
    foreignIncome: profile.fx?.foreignIncome ?? base.foreignIncome,
    incomeStability: profile.income?.incomeStability ?? base.incomeStability,
    monthsOfCashBuffer: profile.liquidity?.monthsOfCashBuffer ?? base.monthsOfCashBuffer,
  };
}

function draftToProfile(draft: ExposureDraft): ExposureProfile {
  return {
    debt: {
      hasDebt: draft.hasDebt,
      rateType: draft.rateType,
      repricingHorizon: draft.repricingHorizon,
    },
    inflation: {
      essentialExpenseShare: draft.essentialExpenseShare,
      rentOrMortgageShare: draft.rentOrMortgageShare,
      energyShare: draft.energyShare,
    },
    fx: {
      foreignConsumption: draft.foreignConsumption,
      foreignIncome: draft.foreignIncome,
    },
    income: {
      incomeStability: draft.incomeStability,
    },
    liquidity: {
      monthsOfCashBuffer: draft.monthsOfCashBuffer,
    },
  };
}

export function ExposureProfileClient({ csrf }: ExposureProfileClientProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExposureDraft>(defaultDraft());
  const [initialDraft, setInitialDraft] = useState<ExposureDraft>(defaultDraft());

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initialDraft), [draft, initialDraft]);
  const completedFields = useMemo(() => countCompletedFields(draft), [draft]);
  const summaryCards = useMemo(() => ([
    { label: "입력 완료", value: `${completedFields}/${EXPOSURE_KEYS.length}`, hint: completedFields >= 7 ? "시나리오 개인화에 충분" : "모를 항목은 비워둬도 됩니다." },
    { label: "금리/부채", value: summarizeDebtSensitivity(draft), hint: "대출 구조와 금리 타입 기준" },
    { label: "생활비 체감", value: summarizeLivingCost(draft), hint: "필수지출·주거비·에너지 비중 기준" },
    { label: "환율/완충", value: `${summarizeFxIncome(draft)} · ${summarizeLiquidity(draft)}`, hint: "해외 지출·외화 소득·현금 버팀력 기준" },
  ]), [completedFields, draft]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/planning/v3/exposure/profile", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = (await response.json().catch(() => null)) as ExposureResponse | null;
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      const next = profileToDraft(payload.profile ?? null);
      setDraft(next);
      setInitialDraft(next);
      setSavedAt(payload.profile?.savedAt ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "노출 프로필을 불러오지 못했습니다.");
      const reset = defaultDraft();
      setDraft(reset);
      setInitialDraft(reset);
      setSavedAt(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function setField<K extends keyof ExposureDraft>(key: K, value: ExposureDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const withCsrf = withDevCsrf({ profile: draftToProfile(draft) });
      if (!withCsrf.csrf && asString(csrf)) withCsrf.csrf = asString(csrf);
      const response = await fetch("/api/planning/v3/exposure/profile", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify(withCsrf),
      });
      const payload = (await response.json().catch(() => null)) as ExposureResponse | null;
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }
      const next = profileToDraft(payload.profile ?? null);
      setDraft(next);
      setInitialDraft(next);
      setSavedAt(payload.profile?.savedAt ?? null);
      setNotice("노출 프로필을 저장했습니다.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "노출 프로필 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell>
      <div className="space-y-5">
        <ReportHeroCard
          kicker="Personal Exposure"
          title="내 상황 프로필"
          description="뉴스 시나리오가 내 현금흐름과 부채에 어떤 식으로 닿는지 계산할 때 쓰는 기본 정보입니다."
          action={(
            <>
              <Link href="/planning/v3/news" className={reportHeroActionLinkClassName}>뉴스로 돌아가기</Link>
              <button
                type="button"
                disabled={loading || saving || !dirty}
                onClick={() => { void handleSave(); }}
                className={`${reportHeroPrimaryActionClassName} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </>
          )}
        >
          <p className="text-xs text-white/60">마지막 저장 시각: {formatDateTime(savedAt)}</p>
          <ReportHeroStatGrid>
            {summaryCards.map((card) => (
              <ReportHeroStatCard key={card.label} label={card.label} value={card.value} description={card.hint} />
            ))}
          </ReportHeroStatGrid>
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-xs text-emerald-100">
            모든 항목을 다 채울 필요는 없습니다. 모르는 값은 그대로 두고, 내 생활비와 부채 구조를 설명하는 항목부터 입력하면 됩니다.
          </div>
          {notice ? <p className="text-xs font-semibold text-emerald-300">{notice}</p> : null}
          {error ? <p className="text-xs font-semibold text-rose-300">{error}</p> : null}
        </ReportHeroCard>

        <Card className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">부채와 금리</h2>
            <p className="text-xs text-slate-500">대출이 있으면 금리 인상이나 재조정 시점의 영향을 더 크게 받습니다.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Select label="부채 보유" value={draft.hasDebt} onChange={(value) => setField("hasDebt", value as ExposureDraft["hasDebt"])} options={["yes", "no", "unknown"]} />
            <Select label="금리 유형" value={draft.rateType} onChange={(value) => setField("rateType", value as ExposureDraft["rateType"])} options={["fixed", "variable", "mixed", "none", "unknown"]} />
            <Select label="재조정 민감도" value={draft.repricingHorizon} onChange={(value) => setField("repricingHorizon", value as ExposureDraft["repricingHorizon"])} options={["short", "medium", "long", "none", "unknown"]} />
          </div>
        </Card>

        <Card className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">생활비와 물가</h2>
            <p className="text-xs text-slate-500">필수지출, 주거비, 에너지비 비중이 높을수록 물가 상승을 더 민감하게 느낄 수 있습니다.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Select label="필수지출 비중" value={draft.essentialExpenseShare} onChange={(value) => setField("essentialExpenseShare", value as ExposureDraft["essentialExpenseShare"])} options={["low", "medium", "high", "unknown"]} />
            <Select label="주거비 비중" value={draft.rentOrMortgageShare} onChange={(value) => setField("rentOrMortgageShare", value as ExposureDraft["rentOrMortgageShare"])} options={["low", "medium", "high", "unknown"]} />
            <Select label="에너지 비중" value={draft.energyShare} onChange={(value) => setField("energyShare", value as ExposureDraft["energyShare"])} options={["low", "medium", "high", "unknown"]} />
          </div>
        </Card>

        <Card className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">환율, 소득, 현금 완충력</h2>
            <p className="text-xs text-slate-500">해외 소비와 외화 소득, 그리고 몇 달 버틸 현금이 있는지가 변동성 대응력에 직접 연결됩니다.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Select label="해외소비 노출" value={draft.foreignConsumption} onChange={(value) => setField("foreignConsumption", value as ExposureDraft["foreignConsumption"])} options={["low", "medium", "high", "unknown"]} />
            <Select label="외화소득 노출" value={draft.foreignIncome} onChange={(value) => setField("foreignIncome", value as ExposureDraft["foreignIncome"])} options={["low", "medium", "high", "unknown"]} />
            <Select label="소득 안정성" value={draft.incomeStability} onChange={(value) => setField("incomeStability", value as ExposureDraft["incomeStability"])} options={["stable", "moderate", "fragile", "unknown"]} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Select label="현금완충력" value={draft.monthsOfCashBuffer} onChange={(value) => setField("monthsOfCashBuffer", value as ExposureDraft["monthsOfCashBuffer"])} options={["low", "medium", "high", "unknown"]} />
          </div>
        </Card>
      </div>
    </PageShell>
  );
}

function Select(props: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-xs text-slate-700">
      <span className="font-semibold">{props.label}</span>
      <select
        className="w-full rounded border border-slate-300 px-2 py-1"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.options.map((option) => (
          <option key={`${props.label}-${option}`} value={option}>{labelValue(option)}</option>
        ))}
      </select>
    </label>
  );
}
