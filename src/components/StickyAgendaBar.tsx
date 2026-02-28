"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { FeedbackPriority, FeedbackStatus } from "@/lib/feedback/feedbackStore";
import { parseOpsAction } from "@/lib/ops/opsTicketParser";

const DEV_UNLOCKED_SESSION_KEY = "dev_action_unlocked_v1";
const DEV_CSRF_SESSION_KEY = "dev_action_csrf_v1";

type AgendaItem = {
  id: string;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  dueDate: string | null;
  message: string;
  tags: string[];
  note: string;
};

type StickyAgenda = {
  opsTop: AgendaItem[];
  overdueCount: number;
  todayHighCount: number;
  noDueHighCount: number;
  overdue: AgendaItem[];
  today: AgendaItem[];
  noDueHigh: AgendaItem[];
};

type StickyAgendaBarProps = {
  agenda: StickyAgenda;
  onMarkDoing: (id: string) => void;
  onMarkDone: (id: string) => void;
};

type ChainPlan = {
  risk: "LOW" | "MEDIUM" | "HIGH";
  steps: string[];
  impact: string[];
};

type OpsState = {
  loadingPlan: boolean;
  running: boolean;
  message: string;
  plan?: ChainPlan;
};

function summarizeMessage(message: string, maxLength = 58): string {
  const compact = message.trim().replace(/\s+/g, " ");
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength)}...`;
}

function isHighPriority(value: FeedbackPriority): boolean {
  return value === "P0" || value === "P1";
}

function dueLabel(value: string | null): string {
  if (!value) return "기한 미정";
  return value;
}

function readDevCsrf(): string | null {
  if (typeof window === "undefined") return null;
  const unlocked = window.sessionStorage.getItem(DEV_UNLOCKED_SESSION_KEY) === "1";
  const csrf = (window.sessionStorage.getItem(DEV_CSRF_SESSION_KEY) ?? "").trim();
  if (!unlocked || !csrf) return null;
  return csrf;
}

function riskBadgeClass(risk: "LOW" | "MEDIUM" | "HIGH"): string {
  if (risk === "HIGH") return "border-rose-200 bg-rose-50 text-rose-700";
  if (risk === "MEDIUM") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export function StickyAgendaBar({ agenda, onMarkDoing, onMarkDone }: StickyAgendaBarProps) {
  const isDevEnv = process.env.NODE_ENV !== "production";
  const [opsStates, setOpsStates] = useState<Record<string, OpsState>>({});

  const opsIds = useMemo(() => new Set(agenda.opsTop.map((item) => item.id)), [agenda.opsTop]);
  const urgentPool: Array<AgendaItem & { reason: "overdue" | "today" | "nodue" }> = [
    ...agenda.overdue.filter((item) => !opsIds.has(item.id)).map((item) => ({ ...item, reason: "overdue" as const })),
    ...agenda.today.filter((item) => !opsIds.has(item.id) && isHighPriority(item.priority)).map((item) => ({ ...item, reason: "today" as const })),
    ...agenda.noDueHigh.filter((item) => !opsIds.has(item.id)).map((item) => ({ ...item, reason: "nodue" as const })),
  ];

  const urgentItems: Array<AgendaItem & { reason: "overdue" | "today" | "nodue" }> = [];
  const seen = new Set<string>();
  for (const item of urgentPool) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    urgentItems.push(item);
    if (urgentItems.length >= 3) break;
  }

  const requestChainPlan = useCallback(async (chainId: string, csrf: string): Promise<ChainPlan> => {
    const response = await fetch("/api/dev/doctor/fix/chain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chainId, csrf, dryRun: true }),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      dryRun?: boolean;
      chain?: {
        risk?: unknown;
        steps?: unknown;
        impact?: unknown;
      };
      error?: { message?: string };
    } | null;
    if (!response.ok || !payload?.ok || payload?.dryRun !== true || !payload.chain) {
      throw new Error(payload?.error?.message ?? "복구 계획 조회에 실패했습니다.");
    }
    const risk = payload.chain.risk === "LOW" || payload.chain.risk === "MEDIUM" || payload.chain.risk === "HIGH"
      ? payload.chain.risk
      : "MEDIUM";
    const steps = Array.isArray(payload.chain.steps)
      ? payload.chain.steps.filter((step): step is string => typeof step === "string" && step.trim().length > 0)
      : [];
    const impact = Array.isArray(payload.chain.impact)
      ? payload.chain.impact.filter((line): line is string => typeof line === "string" && line.trim().length > 0)
      : [];
    return { risk, steps, impact };
  }, []);

  const runOpsPlan = useCallback(async (item: AgendaItem) => {
    const action = parseOpsAction(item);
    if (!action) {
      setOpsStates((prev) => ({ ...prev, [item.id]: { ...prev[item.id], loadingPlan: false, running: false, message: "OPS 액션을 해석하지 못했습니다." } }));
      return;
    }
    if (!isDevEnv) return;
    const csrf = readDevCsrf();
    if (!csrf) {
      setOpsStates((prev) => ({ ...prev, [item.id]: { ...prev[item.id], loadingPlan: false, running: false, message: "Dev unlock/CSRF 확인이 필요합니다." } }));
      return;
    }

    if (action.kind === "FIX") {
      const suggested = action.suggestedFixIds && action.suggestedFixIds.length > 0
        ? ` (추천: ${action.suggestedFixIds.join(", ")})`
        : "";
      setOpsStates((prev) => ({
        ...prev,
        [item.id]: {
          ...prev[item.id],
          loadingPlan: false,
          running: false,
          message: `단일 Fix 실행 대상: ${action.id}${suggested}`,
        },
      }));
      return;
    }

    setOpsStates((prev) => ({ ...prev, [item.id]: { ...prev[item.id], loadingPlan: true, running: false, message: "" } }));
    try {
      const plan = await requestChainPlan(action.id, csrf);
      setOpsStates((prev) => ({
        ...prev,
        [item.id]: {
          ...prev[item.id],
          loadingPlan: false,
          running: false,
          plan,
          message: `체인 계획 확인 완료 (risk=${plan.risk}, steps=${plan.steps.length})`,
        },
      }));
    } catch (error) {
      setOpsStates((prev) => ({
        ...prev,
        [item.id]: {
          ...prev[item.id],
          loadingPlan: false,
          running: false,
          message: error instanceof Error ? error.message : "복구 계획 조회 중 오류가 발생했습니다.",
        },
      }));
    }
  }, [isDevEnv, requestChainPlan]);

  const runOpsExecute = useCallback(async (item: AgendaItem) => {
    const action = parseOpsAction(item);
    if (!action) {
      setOpsStates((prev) => ({ ...prev, [item.id]: { ...prev[item.id], loadingPlan: false, running: false, message: "OPS 액션을 해석하지 못했습니다." } }));
      return;
    }
    if (!isDevEnv) return;
    const csrf = readDevCsrf();
    if (!csrf) {
      setOpsStates((prev) => ({ ...prev, [item.id]: { ...prev[item.id], loadingPlan: false, running: false, message: "Dev unlock/CSRF 확인이 필요합니다." } }));
      return;
    }

    setOpsStates((prev) => ({ ...prev, [item.id]: { ...prev[item.id], loadingPlan: false, running: true, message: "" } }));

    try {
      if (action.kind === "FIX") {
        const response = await fetch("/api/dev/doctor/fix", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fixId: action.id, csrf }),
        });
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          tookMs?: number;
          historyId?: string;
          error?: { message?: string };
        } | null;
        const success = response.ok && payload?.ok === true;
        setOpsStates((prev) => ({
          ...prev,
          [item.id]: {
            ...prev[item.id],
            running: false,
            message: success
              ? `Fix 실행 완료 (${Number(payload?.tookMs ?? 0)}ms, id=${String(payload?.historyId ?? "-")})`
              : (payload?.error?.message ?? "Fix 실행에 실패했습니다."),
          },
        }));
        return;
      }

      const plan = await requestChainPlan(action.id, csrf);
      let confirmText = "";
      if (plan.risk === "HIGH") {
        const expected = `RUN ${action.id}`;
        const typed = window.prompt(`HIGH 위험 체인입니다. 다음 문구를 정확히 입력하세요:\n${expected}`, expected);
        if ((typed ?? "").trim() !== expected) {
          setOpsStates((prev) => ({
            ...prev,
            [item.id]: {
              ...prev[item.id],
              running: false,
              plan,
              message: `확인 문구 불일치로 실행이 중단되었습니다. (${expected})`,
            },
          }));
          return;
        }
        confirmText = expected;
      }

      const response = await fetch("/api/dev/doctor/fix/chain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chainId: action.id, csrf, dryRun: false, confirmText }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        historyId?: string;
        steps?: unknown[];
        error?: { message?: string };
      } | null;
      const success = response.ok && payload?.ok === true;
      const stepCount = Array.isArray(payload?.steps) ? payload.steps.length : 0;
      setOpsStates((prev) => ({
        ...prev,
        [item.id]: {
          ...prev[item.id],
          running: false,
          plan,
          message: success
            ? `체인 실행 완료 (steps=${stepCount}, id=${String(payload?.historyId ?? "-")})`
            : (payload?.error?.message ?? "체인 실행에 실패했습니다."),
        },
      }));
    } catch (error) {
      setOpsStates((prev) => ({
        ...prev,
        [item.id]: {
          ...prev[item.id],
          running: false,
          message: error instanceof Error ? error.message : "복구 실행 중 오류가 발생했습니다.",
        },
      }));
    }
  }, [isDevEnv, requestChainPlan]);

  return (
    <section className="sticky top-0 z-40 mb-6">
      <div className="rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-md backdrop-blur-sm md:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-1 text-[11px] font-black text-slate-700 md:text-xs">오늘 할 일</p>
          <span className="rounded-full bg-rose-100 px-2 py-1 text-[11px] font-bold text-rose-700">
            마감 {agenda.overdueCount}
          </span>
          <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-700">
            오늘(P0/P1) {agenda.todayHighCount}
          </span>
          <span className="rounded-full bg-sky-100 px-2 py-1 text-[11px] font-bold text-sky-700">
            기한 미정(P0/P1) {agenda.noDueHighCount}
          </span>
        </div>

        {agenda.opsTop.length > 0 ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2.5">
            <p className="text-xs font-black text-rose-800">운영 이슈(OPS)</p>
            <ul className="mt-2 space-y-2">
              {agenda.opsTop.map((item) => {
                const action = parseOpsAction(item);
                const state = opsStates[item.id];
                return (
                  <li key={`ops:${item.id}`} className="rounded-lg border border-rose-200 bg-white p-2">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <Link href={`/feedback/${encodeURIComponent(item.id)}`} className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-slate-800 hover:text-rose-700">{summarizeMessage(item.message, 72)}</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {item.priority} · {dueLabel(item.dueDate)}{action?.cause ? ` · cause=${action.cause}` : ""}
                        </p>
                      </Link>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => onMarkDoing(item.id)}
                          disabled={item.status === "DOING"}
                        >
                          진행
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => onMarkDone(item.id)}
                          disabled={item.status === "DONE"}
                        >
                          완료
                        </button>
                        {isDevEnv && action ? (
                          <>
                            <button
                              type="button"
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => void runOpsPlan(item)}
                              disabled={state?.loadingPlan || state?.running}
                            >
                              {state?.loadingPlan ? "계획 조회 중..." : "복구 계획 보기"}
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => void runOpsExecute(item)}
                              disabled={state?.running === true}
                            >
                              {state?.running ? "복구 실행 중..." : "복구 실행"}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {!isDevEnv ? (
                      <p className="mt-1 text-[11px] text-slate-500">복구 버튼은 dev 환경에서만 표시됩니다.</p>
                    ) : null}
                    {state?.plan ? (
                      <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${riskBadgeClass(state.plan.risk)}`}>
                          {state.plan.risk}
                        </span>
                        <p className="mt-1 text-[10px] text-slate-700">steps: {state.plan.steps.join(" -> ")}</p>
                      </div>
                    ) : null}
                    {state?.message ? (
                      <p className="mt-1 text-[11px] font-semibold text-slate-700">{state.message}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {urgentItems.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {urgentItems.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 md:flex-row md:items-center md:justify-between">
                <Link href={`/feedback/${encodeURIComponent(item.id)}`} className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-800 hover:text-emerald-700">
                    {summarizeMessage(item.message)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {item.priority} · {dueLabel(item.dueDate)}
                  </p>
                </Link>
                <div className="flex items-center gap-1.5 md:ml-3">
                  <button
                    type="button"
                    className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => onMarkDoing(item.id)}
                    disabled={item.status === "DOING"}
                  >
                    진행
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => onMarkDone(item.id)}
                    disabled={item.status === "DONE"}
                  >
                    완료
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
