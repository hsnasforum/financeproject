"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DevUnlockShortcutLink } from "@/components/DevUnlockShortcutLink";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { resolveClientApiError } from "@/lib/http/clientApiError";

type OpsAuditEvent = {
  eventType: string;
  at: string;
  actor: "local";
  meta?: Record<string, unknown>;
};

type OpsAuditPayload = {
  ok?: boolean;
  data?: OpsAuditEvent[];
  meta?: {
    limit?: number;
    eventType?: string;
    taskName?: string;
    types?: string[];
    taskNames?: string[];
  };
  message?: string;
  error?: { code?: string; message?: string; fixHref?: string };
};

type OpsAuditClientProps = {
  csrf: string;
};

type PolicyDiffFilter = "all" | "increase" | "decrease" | "same";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDateTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString("ko-KR", { hour12: false });
}

function previewMeta(value: unknown): string {
  if (!value) return "-";
  try {
    const text = JSON.stringify(value);
    if (!text) return "-";
    return text.length > 100 ? `${text.slice(0, 100)}...` : text;
  } catch {
    return "-";
  }
}

function readInt(value: unknown): number | null {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

type PolicyDelta = {
  before: number;
  after: number;
  delta: number;
};

type SchedulerPolicyDiffViewModel =
  | { kind: "none" }
  | {
      kind: "change";
      summary: string;
      warn?: PolicyDelta;
      risk?: PolicyDelta;
    };

function extractSchedulerPolicyDiff(meta: Record<string, unknown> | undefined): {
  warnDelta?: number;
  riskDelta?: number;
} {
  if (!meta) return {};
  const before = meta.before && typeof meta.before === "object" && !Array.isArray(meta.before)
    ? meta.before as Record<string, unknown>
    : null;
  const after = meta.after && typeof meta.after === "object" && !Array.isArray(meta.after)
    ? meta.after as Record<string, unknown>
    : null;
  const beforeWarn = readInt(before?.warnConsecutiveFailures);
  const beforeRisk = readInt(before?.riskConsecutiveFailures);
  const afterWarn = readInt(after?.warnConsecutiveFailures);
  const afterRisk = readInt(after?.riskConsecutiveFailures);
  return {
    ...(beforeWarn !== null && afterWarn !== null ? { warnDelta: afterWarn - beforeWarn } : {}),
    ...(beforeRisk !== null && afterRisk !== null ? { riskDelta: afterRisk - beforeRisk } : {}),
  };
}

function matchesPolicyDiffFilter(row: OpsAuditEvent, filter: PolicyDiffFilter): boolean {
  if (filter === "all") return true;
  if (row.eventType !== "OPS_SCHEDULER_POLICY_UPDATE") return false;
  const diff = extractSchedulerPolicyDiff(row.meta);
  const deltas = [diff.warnDelta, diff.riskDelta].filter((value): value is number => typeof value === "number");
  if (deltas.length < 1) return false;
  if (filter === "increase") return deltas.some((delta) => delta > 0);
  if (filter === "decrease") return deltas.some((delta) => delta < 0);
  return deltas.every((delta) => delta === 0);
}

function schedulerDeltaBadgeClass(delta: number): string {
  if (delta > 0) return "border-rose-200 bg-rose-50 text-rose-700";
  if (delta < 0) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function toSchedulerPolicyDiff(eventType: string, meta: Record<string, unknown> | undefined): SchedulerPolicyDiffViewModel {
  if (eventType !== "OPS_SCHEDULER_POLICY_UPDATE") return { kind: "none" };
  if (!meta) {
    return {
      kind: "change",
      summary: "변경 정보 없음",
    };
  }
  const before = meta.before && typeof meta.before === "object" && !Array.isArray(meta.before)
    ? meta.before as Record<string, unknown>
    : null;
  const after = meta.after && typeof meta.after === "object" && !Array.isArray(meta.after)
    ? meta.after as Record<string, unknown>
    : null;
  const beforeWarn = readInt(before?.warnConsecutiveFailures);
  const beforeRisk = readInt(before?.riskConsecutiveFailures);
  const afterWarn = readInt(after?.warnConsecutiveFailures);
  const afterRisk = readInt(after?.riskConsecutiveFailures);
  const reset = meta.reset === true;
  if (beforeWarn === null || beforeRisk === null || afterWarn === null || afterRisk === null) {
    return {
      kind: "change",
      summary: reset ? "ENV 기본값으로 초기화" : "임계치 변경",
    };
  }
  const label = reset ? "초기화" : "변경";
  return {
    kind: "change",
    summary: `${label}: WARN ${beforeWarn} -> ${afterWarn}, RISK ${beforeRisk} -> ${afterRisk}`,
    warn: {
      before: beforeWarn,
      after: afterWarn,
      delta: afterWarn - beforeWarn,
    },
    risk: {
      before: beforeRisk,
      after: afterRisk,
      delta: afterRisk - beforeRisk,
    },
  };
}

export function OpsAuditClient({ csrf }: OpsAuditClientProps) {
  const [rows, setRows] = useState<OpsAuditEvent[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [taskNames, setTaskNames] = useState<string[]>([]);
  const [eventType, setEventType] = useState("");
  const [taskName, setTaskName] = useState("");
  const [policyDiffFilter, setPolicyDiffFilter] = useState<PolicyDiffFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hasCsrf = asString(csrf).length > 0;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const nextEventType = asString(params.get("eventType")).toUpperCase();
    const nextTaskName = asString(params.get("taskName")).toUpperCase();
    if (nextEventType) setEventType(nextEventType);
    if (nextTaskName) setTaskName(nextTaskName);
  }, []);

  const loadAudit = useCallback(async () => {
    if (!hasCsrf) {
      setRows([]);
      setError("Dev unlock/CSRF가 없어 감사 로그를 조회할 수 없습니다.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("csrf", csrf);
      params.set("limit", "200");
      if (asString(eventType)) {
        params.set("eventType", eventType);
      }
      if (asString(taskName)) {
        params.set("taskName", taskName);
      }

      const response = await fetch(`/api/ops/audit?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as OpsAuditPayload | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
        const apiError = resolveClientApiError(payload, "감사 로그를 불러오지 못했습니다.");
        throw new Error(apiError.message);
      }

      setRows(payload.data.filter((row) => matchesPolicyDiffFilter(row, policyDiffFilter)));
      const nextTypes = Array.isArray(payload.meta?.types)
        ? payload.meta?.types.map((row) => asString(row)).filter((row) => row.length > 0)
        : [];
      const nextTaskNames = Array.isArray(payload.meta?.taskNames)
        ? payload.meta.taskNames.map((row) => asString(row).toUpperCase()).filter((row) => row.length > 0)
        : [];
      setEventTypes(nextTypes);
      setTaskNames(nextTaskNames);
    } catch (loadError) {
      setRows([]);
      setEventTypes([]);
      setTaskNames([]);
      setError(loadError instanceof Error ? loadError.message : "감사 로그를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [csrf, eventType, hasCsrf, policyDiffFilter, taskName]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  return (
    <PageShell>
      <PageHeader
        title="Ops Audit"
        description="보안/운영 이벤트 감사 로그 (최근 200건)"
        action={(
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void loadAudit()} disabled={loading || !hasCsrf}>
              {loading ? "새로고침 중..." : "새로고침"}
            </Button>
            <Link href="/ops">
              <Button type="button" size="sm" variant="outline">Ops 허브</Button>
            </Link>
          </div>
        )}
      />

      {!hasCsrf ? (
        <Card className="mb-4 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Dev unlock/CSRF가 없어 감사 로그를 조회할 수 없습니다.{" "}
          <DevUnlockShortcutLink className="text-amber-900" />
        </Card>
      ) : null}

      <Card className="mb-4 p-4">
        <h2 className="text-base font-black text-slate-900">필터</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block text-xs text-slate-600">
            Event Type
            <select
              className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
              value={eventType}
              onChange={(event) => setEventType(event.target.value)}
            >
              <option value="">ALL</option>
              {eventTypes.map((row) => (
                <option key={row} value={row}>{row}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-600">
            Task Name
            <select
              className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
              value={taskName}
              onChange={(event) => setTaskName(event.target.value)}
            >
              <option value="">ALL</option>
              {taskNames.map((row) => (
                <option key={row} value={row}>{row}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setEventType("SCHEDULED_TASK");
              setTaskName("OPS_SCHEDULER_HEALTH");
            }}
          >
            스케줄러 헬스만 보기
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setEventType("OPS_SCHEDULER_POLICY_UPDATE");
              setTaskName("");
              setPolicyDiffFilter("all");
            }}
          >
            임계치 변경 이력만 보기
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setEventType("");
              setTaskName("");
              setPolicyDiffFilter("all");
            }}
          >
            필터 초기화
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={policyDiffFilter === "all" ? "primary" : "outline"}
            onClick={() => setPolicyDiffFilter("all")}
          >
            변경 요약 전체
          </Button>
          <Button
            type="button"
            size="sm"
            variant={policyDiffFilter === "increase" ? "primary" : "outline"}
            onClick={() => {
              setEventType("OPS_SCHEDULER_POLICY_UPDATE");
              setTaskName("");
              setPolicyDiffFilter("increase");
            }}
          >
            임계치 증가만
          </Button>
          <Button
            type="button"
            size="sm"
            variant={policyDiffFilter === "decrease" ? "primary" : "outline"}
            onClick={() => {
              setEventType("OPS_SCHEDULER_POLICY_UPDATE");
              setTaskName("");
              setPolicyDiffFilter("decrease");
            }}
          >
            임계치 감소만
          </Button>
          <Button
            type="button"
            size="sm"
            variant={policyDiffFilter === "same" ? "primary" : "outline"}
            onClick={() => {
              setEventType("OPS_SCHEDULER_POLICY_UPDATE");
              setTaskName("");
              setPolicyDiffFilter("same");
            }}
          >
            동일값만
          </Button>
        </div>
      </Card>

      {loading && rows.length < 1 ? <LoadingState className="mb-4" title="감사 로그를 불러오는 중입니다" /> : null}
      {error ? <ErrorState className="mb-4" message={error} onRetry={() => void loadAudit()} retryLabel="다시 시도" /> : null}
      {!loading && !error && rows.length < 1 ? (
        <EmptyState
          className="mb-4"
          title="감사 로그가 없습니다"
          description="조건에 맞는 감사 이벤트가 없습니다."
          actionLabel="새로고침"
          onAction={() => void loadAudit()}
          icon="data"
        />
      ) : null}

      {rows.length > 0 ? (
        <Card className="overflow-x-auto p-0">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-semibold">시각</th>
                <th className="px-3 py-2 font-semibold">이벤트</th>
                <th className="px-3 py-2 font-semibold">변경 요약</th>
                <th className="px-3 py-2 font-semibold">Actor</th>
                <th className="px-3 py-2 font-semibold">Meta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.at}-${row.eventType}-${index}`} className="border-t border-slate-200 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{formatDateTime(row.at)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-900">{row.eventType}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {(() => {
                      const diff = toSchedulerPolicyDiff(row.eventType, row.meta);
                      if (diff.kind !== "change") return "-";
                      return (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>{diff.summary}</span>
                          {diff.warn ? (
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${schedulerDeltaBadgeClass(diff.warn.delta)}`}>
                              WARN {formatDelta(diff.warn.delta)}
                            </span>
                          ) : null}
                          {diff.risk ? (
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${schedulerDeltaBadgeClass(diff.risk.delta)}`}>
                              RISK {formatDelta(diff.risk.delta)}
                            </span>
                          ) : null}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{row.actor}</td>
                  <td className="max-w-[520px] px-3 py-2 text-slate-700">
                    {row.meta ? (
                      <details>
                        <summary className="cursor-pointer">{previewMeta(row.meta)}</summary>
                        <pre className="mt-1 overflow-auto rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-700">
                          {JSON.stringify(row.meta, null, 2)}
                        </pre>
                      </details>
                    ) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </PageShell>
  );
}
