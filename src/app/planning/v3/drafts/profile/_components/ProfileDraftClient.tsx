"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { BodyActionLink, bodyDenseActionRowClassName, BodySectionHeading } from "@/components/ui/BodyTone";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { withDevCsrf } from "@/lib/dev/clientCsrf";

type DraftPatch = {
  monthlyIncomeNet: number;
  monthlyEssentialExpenses: number;
  monthlyDiscretionaryExpenses: number;
  emergencyFundTargetKrw: number;
  assumptions: string[];
  monthsConsidered: number;
};

type DraftEvidence = {
  monthsUsed: string[];
  stats: {
    sampleMonths: number;
    windowMonths: number;
    incomeMedianKrw: number;
    fixedMedianKrw: number;
    variableMedianKrw: number;
    emergencyFundTargetKrw: number;
  };
  notes: string[];
};

type DraftProfileResponse = {
  ok: true;
  batchId: string;
  patch: DraftPatch;
  evidence: DraftEvidence;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function formatKrw(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function isDraftProfileResponse(payload: unknown): payload is DraftProfileResponse {
  if (!isRecord(payload) || payload.ok !== true) return false;
  if (!asString(payload.batchId)) return false;
  return isRecord(payload.patch) && isRecord(payload.evidence);
}

export function ProfileDraftClient() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [batchId, setBatchId] = useState("");
  const [patch, setPatch] = useState<DraftPatch | null>(null);
  const [evidence, setEvidence] = useState<DraftEvidence | null>(null);

  async function handleGenerate() {
    if (loading) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/planning/v3/draft/profile", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({
          source: "csv",
          includeTransfers: 0,
        })),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !isDraftProfileResponse(payload)) {
        const errorMessage = isRecord(payload) && isRecord(payload.error)
          ? asString(payload.error.message)
          : "";
        setPatch(null);
        setEvidence(null);
        setBatchId("");
        setMessage(errorMessage || "프로필 초안을 생성하지 못했습니다.");
        return;
      }

      setBatchId(payload.batchId);
      setPatch({
        monthlyIncomeNet: asNumber(payload.patch.monthlyIncomeNet),
        monthlyEssentialExpenses: asNumber(payload.patch.monthlyEssentialExpenses),
        monthlyDiscretionaryExpenses: asNumber(payload.patch.monthlyDiscretionaryExpenses),
        emergencyFundTargetKrw: asNumber(payload.patch.emergencyFundTargetKrw),
        assumptions: Array.isArray(payload.patch.assumptions) ? payload.patch.assumptions.map((row) => asString(row)).filter(Boolean) : [],
        monthsConsidered: asNumber(payload.patch.monthsConsidered),
      });
      setEvidence({
        monthsUsed: Array.isArray(payload.evidence.monthsUsed)
          ? payload.evidence.monthsUsed.map((row) => asString(row)).filter(Boolean)
          : [],
        stats: {
          sampleMonths: asNumber(payload.evidence.stats?.sampleMonths),
          windowMonths: asNumber(payload.evidence.stats?.windowMonths),
          incomeMedianKrw: asNumber(payload.evidence.stats?.incomeMedianKrw),
          fixedMedianKrw: asNumber(payload.evidence.stats?.fixedMedianKrw),
          variableMedianKrw: asNumber(payload.evidence.stats?.variableMedianKrw),
          emergencyFundTargetKrw: asNumber(payload.evidence.stats?.emergencyFundTargetKrw),
        },
        notes: Array.isArray(payload.evidence.notes)
          ? payload.evidence.notes.map((row) => asString(row)).filter(Boolean)
          : [],
      });
    } catch {
      setPatch(null);
      setEvidence(null);
      setBatchId("");
      setMessage("프로필 초안을 생성하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-3">
          <h1 className="text-xl font-black text-slate-900">Planning v3 Profile Draft</h1>
          <p className="text-sm font-semibold text-amber-700">
            이 초안은 자동 저장되지 않습니다.
          </p>
          <div className={bodyDenseActionRowClassName}>
            <Button
              data-testid="v3-profile-draft-generate"
              disabled={loading}
              onClick={() => {
                void handleGenerate();
              }}
              size="sm"
              type="button"
            >
              {loading ? "생성 중..." : "초안 생성"}
            </Button>
            <BodyActionLink href="/planning/v3/transactions/batches">
              배치 목록
            </BodyActionLink>
            <BodyActionLink href="/planning/v3/drafts">
              저장된 Draft 목록
            </BodyActionLink>
          </div>
          {message ? <p className="text-sm font-semibold text-rose-700">{message}</p> : null}
          {batchId ? <p className="text-xs text-slate-600">기준 배치: {batchId}</p> : null}
        </Card>

        {patch ? (
          <Card className="space-y-3" data-testid="v3-profile-draft-summary">
            <BodySectionHeading title="초안 요약" />
            <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              <div>
                <dt className="font-semibold">월 소득 추정</dt>
                <dd>{formatKrw(patch.monthlyIncomeNet)}</dd>
              </div>
              <div>
                <dt className="font-semibold">월 필수지출 추정</dt>
                <dd>{formatKrw(patch.monthlyEssentialExpenses)}</dd>
              </div>
              <div>
                <dt className="font-semibold">월 변동지출 추정</dt>
                <dd>{formatKrw(patch.monthlyDiscretionaryExpenses)}</dd>
              </div>
              <div>
                <dt className="font-semibold">비상금 목표 추정</dt>
                <dd>{formatKrw(patch.emergencyFundTargetKrw)}</dd>
              </div>
              <div>
                <dt className="font-semibold">months considered</dt>
                <dd>{patch.monthsConsidered}</dd>
              </div>
            </dl>
            {patch.assumptions.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
                {patch.assumptions.map((row, index) => (
                  <li key={`${row}-${index}`}>{row}</li>
                ))}
              </ul>
            ) : null}
          </Card>
        ) : null}

        {evidence ? (
          <Card className="space-y-3" data-testid="v3-profile-draft-evidence">
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">근거 보기</summary>
              <div className="mt-3 space-y-2 text-xs text-slate-700">
                <p>monthsUsed: {evidence.monthsUsed.join(", ") || "-"}</p>
                <p>incomeMedian: {formatKrw(evidence.stats.incomeMedianKrw)}</p>
                <p>fixedMedian: {formatKrw(evidence.stats.fixedMedianKrw)}</p>
                <p>variableMedian: {formatKrw(evidence.stats.variableMedianKrw)}</p>
                <p>emergencyFundTarget: {formatKrw(evidence.stats.emergencyFundTargetKrw)}</p>
                {evidence.notes.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
                    {evidence.notes.map((row, index) => (
                      <li key={`${row}-${index}`}>{row}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </details>
          </Card>
        ) : null}
      </div>
    </PageShell>
  );
}
