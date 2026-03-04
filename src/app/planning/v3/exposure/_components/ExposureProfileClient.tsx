"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
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
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-black text-slate-900">Exposure Profile</h1>
              <p className="text-sm text-slate-600">시나리오 개인화 영향 계산용 노출 프로필 (명시적 저장)</p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/planning/v3/news" className="text-sm font-semibold text-emerald-700 underline underline-offset-2">뉴스로 돌아가기</Link>
              <button
                type="button"
                disabled={loading || saving || !dirty}
                onClick={() => { void handleSave(); }}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">마지막 저장 시각: {formatDateTime(savedAt)}</p>
          {notice ? <p className="text-xs font-semibold text-emerald-700">{notice}</p> : null}
          {error ? <p className="text-xs font-semibold text-rose-700">{error}</p> : null}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Debt / Rate</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <Select label="부채 보유" value={draft.hasDebt} onChange={(value) => setField("hasDebt", value as ExposureDraft["hasDebt"])} options={["yes", "no", "unknown"]} />
            <Select label="금리 유형" value={draft.rateType} onChange={(value) => setField("rateType", value as ExposureDraft["rateType"])} options={["fixed", "variable", "mixed", "none", "unknown"]} />
            <Select label="재조정 민감도" value={draft.repricingHorizon} onChange={(value) => setField("repricingHorizon", value as ExposureDraft["repricingHorizon"])} options={["short", "medium", "long", "none", "unknown"]} />
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Inflation</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <Select label="필수지출 비중" value={draft.essentialExpenseShare} onChange={(value) => setField("essentialExpenseShare", value as ExposureDraft["essentialExpenseShare"])} options={["low", "medium", "high", "unknown"]} />
            <Select label="주거비 비중" value={draft.rentOrMortgageShare} onChange={(value) => setField("rentOrMortgageShare", value as ExposureDraft["rentOrMortgageShare"])} options={["low", "medium", "high", "unknown"]} />
            <Select label="에너지 비중" value={draft.energyShare} onChange={(value) => setField("energyShare", value as ExposureDraft["energyShare"])} options={["low", "medium", "high", "unknown"]} />
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">FX / Income / Liquidity</h2>
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
          <option key={`${props.label}-${option}`} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
