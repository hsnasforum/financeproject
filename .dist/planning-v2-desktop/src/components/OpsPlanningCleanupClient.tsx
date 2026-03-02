"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { applyCleanupAction, dryRunCleanupAction } from "@/app/ops/planning-cleanup/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";

type CleanupTarget = "runs" | "cache" | "opsReports" | "assumptionsHistory" | "trash" | "all";

type CleanupData = {
  target: CleanupTarget;
  nowIso: string;
  policy: {
    runs: { keepPerProfile: number; keepDays?: number };
    cache: { keepDays: number };
    opsReports: { keepCount: number };
    assumptionsHistory: { keepCount: number };
    trash: { keepDays: number };
  };
  summary: {
    deleteCount: number;
    totalBytes?: number;
    byTarget: Record<string, number>;
  };
  sample: Array<{ path: string; reason: string; sizeBytes?: number }>;
  expectedConfirm?: string;
  applied?: {
    deleted: number;
    bytes?: number;
    failedCount: number;
  };
};

type OpsPlanningCleanupClientProps = {
  csrf: string;
  initialPolicy: CleanupData["policy"];
};

function formatBytes(value: number | undefined): string {
  if (!Number.isFinite(value) || !value || value <= 0) return "-";
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export function OpsPlanningCleanupClient(props: OpsPlanningCleanupClientProps) {
  const [target, setTarget] = useState<CleanupTarget>("all");
  const [planData, setPlanData] = useState<CleanupData | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [runningDryRun, startDryRun] = useTransition();
  const [runningApply, startApply] = useTransition();

  const expectedConfirm = planData?.expectedConfirm ?? "";
  const hasCsrf = props.csrf.trim().length > 0;
  const canApply = hasCsrf && planData !== null && expectedConfirm.length > 0;
  const byTarget = planData?.summary.byTarget ?? {};

  const policyRows = useMemo(() => ([
    { key: "runs.keepPerProfile", value: String(props.initialPolicy.runs.keepPerProfile) },
    { key: "runs.keepDays", value: typeof props.initialPolicy.runs.keepDays === "number" ? String(props.initialPolicy.runs.keepDays) : "-" },
    { key: "cache.keepDays", value: String(props.initialPolicy.cache.keepDays) },
    { key: "opsReports.keepCount", value: String(props.initialPolicy.opsReports.keepCount) },
    { key: "assumptionsHistory.keepCount", value: String(props.initialPolicy.assumptionsHistory.keepCount) },
    { key: "trash.keepDays", value: String(props.initialPolicy.trash.keepDays) },
  ]), [props.initialPolicy]);

  function runDryRun(): void {
    if (!hasCsrf) {
      window.alert("Dev unlock/CSRF가 없어 dry-run을 실행할 수 없습니다.");
      return;
    }
    startDryRun(async () => {
      const result = await dryRunCleanupAction({ target, csrf: props.csrf });
      if (!result.ok || !result.data) {
        window.alert(result.message || "dry-run 실패");
        return;
      }
      setPlanData(result.data);
      setConfirmText("");
      window.alert(result.message || "dry-run 완료");
    });
  }

  function runApply(): void {
    if (!canApply) return;
    startApply(async () => {
      const result = await applyCleanupAction({
        target,
        csrf: props.csrf,
        confirmText,
      });
      if (!result.ok || !result.data) {
        window.alert(result.message || "cleanup 적용 실패");
        if (result.data) setPlanData(result.data);
        return;
      }
      setPlanData(result.data);
      setConfirmText("");
      window.alert(result.message || "cleanup 적용 완료");
    });
  }

  return (
    <PageShell>
      <PageHeader
        title="플래닝 정리"
        description="Planning 데이터 정리(retention)를 dry-run으로 미리 보고, confirm 후 적용합니다. (Dev only)"
        action={(
          <div className="flex items-center gap-2">
            <Link href="/ops/planning">
              <Button type="button" variant="outline" size="sm">Ops 플래닝 운영</Button>
            </Link>
            <Link href="/ops">
              <Button type="button" variant="outline" size="sm">Ops 허브</Button>
            </Link>
          </div>
        )}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-base font-black text-slate-900">정리 대상</h2>
          <p className="mt-2 text-sm text-slate-600">dry-run 결과를 확인한 뒤 confirm 문구를 입력해 apply 하세요.</p>

          {!hasCsrf ? (
            <p className="mt-3 text-xs font-semibold text-amber-700">Dev unlock/CSRF가 없어 실행 버튼이 비활성화됩니다.</p>
          ) : null}

          <label className="mt-4 block text-xs font-semibold text-slate-700" htmlFor="cleanup-target">대상</label>
          <select
            id="cleanup-target"
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            value={target}
            onChange={(event) => setTarget(event.target.value as CleanupTarget)}
          >
            <option value="all">전체</option>
            <option value="runs">실행 기록(runs)</option>
            <option value="cache">캐시(cache)</option>
            <option value="opsReports">운영 리포트(opsReports)</option>
            <option value="assumptionsHistory">가정 히스토리(assumptionsHistory)</option>
            <option value="trash">휴지통(trash)</option>
          </select>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={runDryRun} disabled={runningDryRun || !hasCsrf}>
              {runningDryRun ? "Dry-run 실행 중..." : "Dry-run"}
            </Button>
            <Button type="button" size="sm" onClick={runApply} disabled={runningApply || !canApply}>
              {runningApply ? "적용 중..." : "적용"}
            </Button>
          </div>

          <label className="mt-4 block text-xs font-semibold text-slate-700" htmlFor="cleanup-confirm">확인 문구</label>
          <input
            id="cleanup-confirm"
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            placeholder={expectedConfirm || "CLEANUP {target} {deleteCount}"}
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">요구 확인 문구: <span className="font-semibold">{expectedConfirm || "-"}</span></p>
        </Card>

        <Card>
          <h2 className="text-base font-black text-slate-900">보존 정책</h2>
          <div className="mt-3 grid gap-2 text-sm">
            {policyRows.map((row) => (
              <div key={row.key} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                {row.key}: <span className="font-semibold">{row.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="text-base font-black text-slate-900">Dry-run 요약</h2>
        {planData ? (
          <>
            <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">대상: <span className="font-semibold">{planData.target}</span></div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">삭제 예정 건수: <span className="font-semibold">{planData.summary.deleteCount}</span></div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">예상 용량: <span className="font-semibold">{formatBytes(planData.summary.totalBytes)}</span></div>
            </div>
            <div className="mt-3 grid gap-2 text-sm md:grid-cols-4">
              {(["runs", "cache", "opsReports", "assumptionsHistory", "trash"] as const).map((key) => (
                <div key={key} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  {key}: <span className="font-semibold">{byTarget[key] ?? 0}</span>
                </div>
              ))}
            </div>
            {planData.applied ? (
              <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                삭제={planData.applied.deleted}, 실패={planData.applied.failedCount}, 용량={formatBytes(planData.applied.bytes)}
              </div>
            ) : null}

            <div className="mt-4">
              <h3 className="text-sm font-black text-slate-900">샘플 파일 (최대 10개)</h3>
              {planData.sample.length < 1 ? (
                <p className="mt-2 text-xs text-slate-500">삭제 예정 파일이 없습니다.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-xs">
                  {planData.sample.map((row, idx) => (
                    <li key={`${row.path}-${idx}`} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="font-semibold text-slate-900">{row.path}</p>
                      <p className="text-slate-600">사유: {row.reason} / 용량: {formatBytes(row.sizeBytes)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-500">먼저 Dry-run을 실행하세요.</p>
        )}
      </Card>
    </PageShell>
  );
}
