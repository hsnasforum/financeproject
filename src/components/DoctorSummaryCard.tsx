"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { DevUnlockShortcutMessage } from "@/components/DevUnlockShortcutLink";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { ChainId, FixChainRisk } from "@/lib/diagnostics/fixChains";
import { recommendRunbook } from "@/lib/diagnostics/runbookRecommender";

type DoctorStatus = "OK" | "WARN" | "FAIL";
type DoctorFixId = "PRISMA_DB_PUSH" | "PRISMA_PUSH" | "SEED_DEBUG" | "DATA_DOCTOR" | "DART_WATCH" | "DAILY_REFRESH";
type DoctorChainId = ChainId;

const DEV_CSRF_SESSION_KEY = "dev_action_csrf_v1";

type DoctorSummaryItem = {
  id: string;
  code?: string;
  title: string;
  status: DoctorStatus;
  message: string;
  action: {
    label: string;
    command: string;
  };
  fixId?: DoctorFixId;
};

type DoctorSummaryPayload = {
  ok?: boolean;
  data?: {
    overall?: DoctorStatus;
    items?: DoctorSummaryItem[];
  };
  error?: {
    message?: string;
  };
};

type DoctorFixAnalysis = {
  cause?: string;
  summary?: string;
  suggestedFixIds?: string[];
};

type DoctorFixStep = {
  fixId: string;
  ok: boolean;
  tookMs: number;
  stdoutTail: string;
  stderrTail: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  analysis?: DoctorFixAnalysis;
};

type DoctorFixPayload = {
  ok?: boolean;
  fixId?: string;
  historyId?: string;
  tookMs?: number;
  stdoutTail?: string;
  stderrTail?: string;
  analysis?: DoctorFixAnalysis;
  error?: {
    code?: string;
    message?: string;
  };
};

type DoctorChainPayload = {
  ok?: boolean;
  dryRun?: boolean;
  chainId?: string;
  historyId?: string;
  steps?: DoctorFixStep[];
  chain?: {
    chainId?: string;
    title?: string;
    risk?: FixChainRisk;
    steps?: string[];
    impact?: string[];
  };
  error?: {
    code?: string;
    message?: string;
  };
};

type DoctorFixHistoryEntry = {
  id: string;
  createdAt: string;
  fixId: string;
  ok: boolean;
  tookMs: number;
  stdoutTail: string;
  stderrTail: string;
  errorCode: string | null;
  errorMessage: string | null;
  chainId?: string;
  steps?: DoctorFixStep[];
  analysis?: DoctorFixAnalysis;
};

type DoctorFixHistoryPayload = {
  ok?: boolean;
  data?: DoctorFixHistoryEntry[];
  error?: {
    message?: string;
  };
};

type FixState = {
  running: boolean;
  ok: boolean | null;
  message: string;
  stdoutTail: string;
  stderrTail: string;
};

type ChainState = {
  running: boolean;
  phase: "idle" | "preview" | "run";
  ok: boolean | null;
  message: string;
  steps: DoctorFixStep[];
  plan: {
    chainId: DoctorChainId;
    title: string;
    risk: FixChainRisk;
    steps: string[];
    impact: string[];
  } | null;
  confirmText: string;
};

const CHAIN_ACTIONS: Array<{ id: DoctorChainId; label: string }> = [
  { id: "DB_REPAIR", label: "DB 복구" },
  { id: "DART_SETUP", label: "DART 설정" },
  { id: "FULL_REPAIR", label: "전체 복구" },
];

function chainLabel(chainId: DoctorChainId): string {
  const found = CHAIN_ACTIONS.find((chain) => chain.id === chainId);
  return found?.label ?? chainId;
}

function badgeClass(status: DoctorStatus): string {
  if (status === "FAIL") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "WARN") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "-";
  return new Date(parsed).toLocaleString("ko-KR");
}

function isDoctorFixId(value: string): value is DoctorFixId {
  return value === "PRISMA_DB_PUSH"
    || value === "PRISMA_PUSH"
    || value === "SEED_DEBUG"
    || value === "DATA_DOCTOR"
    || value === "DART_WATCH"
    || value === "DAILY_REFRESH";
}

function historyFixStateKey(historyId: string, fixId: DoctorFixId): string {
  return `history:${historyId}:${fixId}`;
}

function defaultChainState(): ChainState {
  return {
    running: false,
    phase: "idle",
    ok: null,
    message: "",
    steps: [],
    plan: null,
    confirmText: "",
  };
}

function chainConfirmText(chainId: DoctorChainId): string {
  return `RUN ${chainId}`;
}

function normalizeChainPlan(
  chainId: DoctorChainId,
  value: DoctorChainPayload["chain"],
): ChainState["plan"] {
  if (!value || value.chainId !== chainId) return null;
  const title = typeof value.title === "string" && value.title.trim() ? value.title.trim() : chainLabel(chainId);
  const risk = value.risk === "LOW" || value.risk === "MEDIUM" || value.risk === "HIGH" ? value.risk : "MEDIUM";
  const steps = Array.isArray(value.steps) ? value.steps.filter((step): step is string => typeof step === "string" && step.trim().length > 0) : [];
  const impact = Array.isArray(value.impact) ? value.impact.filter((line): line is string => typeof line === "string" && line.trim().length > 0) : [];
  return {
    chainId,
    title,
    risk,
    steps,
    impact,
  };
}

function resultTextClass(ok: boolean | null): string {
  if (ok === true) return "text-emerald-700";
  if (ok === false) return "text-rose-700";
  return "text-slate-700";
}

function riskBadgeClass(risk: FixChainRisk): string {
  if (risk === "HIGH") return "border-rose-200 bg-rose-50 text-rose-700";
  if (risk === "MEDIUM") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function ChainStepsTable({ steps }: { steps: DoctorFixStep[] }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-[10px] text-slate-700">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-2 py-1 text-left font-semibold">step</th>
            <th className="px-2 py-1 text-left font-semibold">ok</th>
            <th className="px-2 py-1 text-left font-semibold">ms</th>
            <th className="px-2 py-1 text-left font-semibold">error</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {steps.map((step, idx) => (
            <tr key={`${step.fixId}:${idx}`}>
              <td className="px-2 py-1">{step.fixId}</td>
              <td className="px-2 py-1">{step.ok ? "true" : "false"}</td>
              <td className="px-2 py-1">{step.tookMs}</td>
              <td className="px-2 py-1 text-rose-700">
                {step.errorCode || step.errorMessage ? `${step.errorCode ?? "ERROR"}: ${step.errorMessage ?? "-"}` : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DoctorSummaryCard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overall, setOverall] = useState<DoctorStatus>("OK");
  const [items, setItems] = useState<DoctorSummaryItem[]>([]);
  const [showRunbookSummary, setShowRunbookSummary] = useState(false);
  const [fixStates, setFixStates] = useState<Record<string, FixState>>({});
  const [chainStates, setChainStates] = useState<Record<DoctorChainId, ChainState>>({
    DB_REPAIR: defaultChainState(),
    DART_SETUP: defaultChainState(),
    FULL_REPAIR: defaultChainState(),
  });
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [historyRows, setHistoryRows] = useState<DoctorFixHistoryEntry[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState<Record<string, boolean>>({});

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dev/doctor/summary", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as DoctorSummaryPayload | null;
      if (!response.ok || !payload?.ok) {
        setError(payload?.error?.message ?? "Doctor 요약을 불러오지 못했습니다.");
        setItems([]);
        setOverall("WARN");
        return;
      }
      const rows = Array.isArray(payload.data?.items) ? payload.data.items : [];
      const nextOverall = payload.data?.overall === "FAIL" || payload.data?.overall === "WARN" || payload.data?.overall === "OK"
        ? payload.data.overall
        : "WARN";
      setItems(rows);
      setOverall(nextOverall);
    } catch {
      setError("Doctor 요약 조회 중 오류가 발생했습니다.");
      setItems([]);
      setOverall("WARN");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetch("/api/dev/doctor/fix/history?limit=20", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as DoctorFixHistoryPayload | null;
      if (!response.ok || !payload?.ok) {
        setHistoryRows([]);
        setHistoryError(payload?.error?.message ?? "Fix 히스토리를 불러오지 못했습니다.");
        return;
      }
      setHistoryRows(Array.isArray(payload.data) ? payload.data : []);
    } catch {
      setHistoryRows([]);
      setHistoryError("Fix 히스토리 조회 중 오류가 발생했습니다.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const topActions = useMemo(() => {
    const unique = new Set<string>();
    const out: Array<{ label: string; command: string }> = [];
    for (const item of items) {
      const key = `${item.action.label}:${item.action.command}`;
      if (unique.has(key)) continue;
      unique.add(key);
      out.push(item.action);
    }
    return out.slice(0, 6);
  }, [items]);

  const recommendedRunbook = useMemo(() => {
    return recommendRunbook(items);
  }, [items]);

  const runFix = useCallback(async (fixId: DoctorFixId, stateKey: string) => {
    setFixStates((prev) => ({
      ...prev,
      [stateKey]: {
        running: true,
        ok: null,
        message: "",
        stdoutTail: "",
        stderrTail: "",
      },
    }));

    const csrf = window.sessionStorage.getItem(DEV_CSRF_SESSION_KEY);
    if (!csrf) {
      setFixStates((prev) => ({
        ...prev,
        [stateKey]: {
          running: false,
          ok: false,
          message: "Dev unlock 및 CSRF 확인이 필요합니다.",
          stdoutTail: "",
          stderrTail: "",
        },
      }));
      return;
    }

    try {
      const response = await fetch("/api/dev/doctor/fix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fixId,
          csrf,
        }),
      });
      const payload = (await response.json().catch(() => null)) as DoctorFixPayload | null;
      const success = response.ok && payload?.ok === true;
      const message = success
        ? `실행 완료 (${Number(payload?.tookMs ?? 0)}ms, id=${String(payload?.historyId ?? "-")})`
        : [
          payload?.error?.message ?? "Fix 실행에 실패했습니다.",
          payload?.analysis?.summary ? `원인: ${payload.analysis.summary}` : "",
        ].filter(Boolean).join(" / ");
      setFixStates((prev) => ({
        ...prev,
        [stateKey]: {
          running: false,
          ok: success,
          message,
          stdoutTail: String(payload?.stdoutTail ?? ""),
          stderrTail: String(payload?.stderrTail ?? ""),
        },
      }));
      if (success) {
        await loadSummary();
      }
      await loadHistory();
    } catch {
      setFixStates((prev) => ({
        ...prev,
        [stateKey]: {
          running: false,
          ok: false,
          message: "Fix 실행 요청 중 오류가 발생했습니다.",
          stdoutTail: "",
          stderrTail: "",
        },
      }));
      await loadHistory();
    }
  }, [loadHistory, loadSummary]);

  async function handleFix(item: DoctorSummaryItem) {
    if (!item.fixId) return;
    await runFix(item.fixId, item.id);
  }

  const setChainConfirmText = useCallback((chainId: DoctorChainId, value: string) => {
    setChainStates((prev) => ({
      ...prev,
      [chainId]: {
        ...prev[chainId],
        confirmText: value,
      },
    }));
  }, []);

  const previewChain = useCallback(async (chainId: DoctorChainId) => {
    setChainStates((prev) => ({
      ...prev,
      [chainId]: {
        ...prev[chainId],
        running: true,
        phase: "preview",
        ok: null,
        message: "",
        steps: [],
      },
    }));

    const csrf = window.sessionStorage.getItem(DEV_CSRF_SESSION_KEY);
    if (!csrf) {
      setChainStates((prev) => ({
        ...prev,
        [chainId]: {
          ...prev[chainId],
          running: false,
          phase: "idle",
          ok: false,
          message: "Dev unlock 및 CSRF 확인이 필요합니다.",
          plan: null,
          steps: [],
        },
      }));
      return;
    }

    try {
      const response = await fetch("/api/dev/doctor/fix/chain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chainId, csrf, dryRun: true }),
      });
      const payload = (await response.json().catch(() => null)) as DoctorChainPayload | null;
      const plan = normalizeChainPlan(chainId, payload?.chain);
      const success = response.ok && payload?.ok === true && payload?.dryRun === true && plan !== null;
      setChainStates((prev) => ({
        ...prev,
        [chainId]: {
          ...prev[chainId],
          running: false,
          phase: "idle",
          ok: null,
          message: success
            ? "실행 계획을 확인했습니다."
            : (payload?.error?.message ?? "체인 실행 계획을 불러오지 못했습니다."),
          plan: success ? plan : null,
          steps: [],
        },
      }));
    } catch {
      setChainStates((prev) => ({
        ...prev,
        [chainId]: {
          ...prev[chainId],
          running: false,
          phase: "idle",
          ok: false,
          message: "체인 실행 계획 조회 중 오류가 발생했습니다.",
          plan: null,
          steps: [],
        },
      }));
    }
  }, []);

  const executeChain = useCallback(async (chainId: DoctorChainId) => {
    const confirmText = chainStates[chainId]?.confirmText ?? "";
    setChainStates((prev) => ({
      ...prev,
      [chainId]: {
        ...prev[chainId],
        running: true,
        phase: "run",
        ok: null,
        message: "",
        steps: [],
      },
    }));

    const csrf = window.sessionStorage.getItem(DEV_CSRF_SESSION_KEY);
    if (!csrf) {
      setChainStates((prev) => ({
        ...prev,
        [chainId]: {
          ...prev[chainId],
          running: false,
          phase: "idle",
          ok: false,
          message: "Dev unlock 및 CSRF 확인이 필요합니다.",
          steps: [],
        },
      }));
      return;
    }

    try {
      const response = await fetch("/api/dev/doctor/fix/chain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chainId, csrf, dryRun: false, confirmText }),
      });
      const payload = (await response.json().catch(() => null)) as DoctorChainPayload | null;
      const success = response.ok && payload?.ok === true;
      const steps = Array.isArray(payload?.steps) ? payload.steps : [];
      setChainStates((prev) => ({
        ...prev,
        [chainId]: {
          ...prev[chainId],
          running: false,
          phase: "idle",
          ok: success,
          message: success
            ? `체인 실행 완료 (id=${String(payload?.historyId ?? "-")})`
            : (payload?.error?.message ?? "체인 실행에 실패했습니다."),
          steps,
        },
      }));
      await loadSummary();
      await loadHistory();
    } catch {
      setChainStates((prev) => ({
        ...prev,
        [chainId]: {
          ...prev[chainId],
          running: false,
          phase: "idle",
          ok: false,
          message: "체인 실행 요청 중 오류가 발생했습니다.",
          steps: [],
        },
      }));
      await loadHistory();
    }
  }, [chainStates, loadHistory, loadSummary]);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-slate-900">Doctor 요약</h2>
          <p className="mt-1 text-xs text-slate-500">현재 상태와 다음 조치 명령</p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-bold ${badgeClass(overall)}`}>
          {overall}
        </span>
      </div>

      {loading ? (
        <p className="mt-3 text-xs text-slate-500">요약 로딩 중...</p>
      ) : error ? (
        <p className="mt-3 text-xs font-semibold text-rose-700">{error}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => {
            const fixState = fixStates[item.id];
            const running = fixState?.running === true;
            return (
              <li key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-800">{item.title}</p>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClass(item.status)}`}>
                    {item.status}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-600">{item.message}</p>
                <p className="mt-1 text-[11px] text-slate-700">
                  {item.action.label}: <code>{item.action.command}</code>
                </p>
                {item.fixId ? (
                  <div className="mt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-[11px]"
                      disabled={running}
                      onClick={() => void handleFix(item)}
                    >
                      {running ? "실행 중..." : "Fix"}
                    </Button>
                  </div>
                ) : null}
                {fixState && !fixState.running ? (
                  <div className="mt-2 rounded-md border border-slate-200 bg-white p-2">
                    <DevUnlockShortcutMessage
                      className={`text-[11px] font-semibold ${fixState.ok ? "text-emerald-700" : "text-rose-700"}`}
                      linkClassName={fixState.ok ? "text-emerald-700" : "text-rose-700"}
                      message={fixState.message}
                    />
                    {fixState.stdoutTail ? (
                      <pre className="mt-1 whitespace-pre-wrap text-[10px] text-slate-600">{fixState.stdoutTail}</pre>
                    ) : null}
                    {fixState.stderrTail ? (
                      <pre className="mt-1 whitespace-pre-wrap text-[10px] text-rose-700">{fixState.stderrTail}</pre>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {recommendedRunbook ? (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-3 py-3">
          <p className="text-xs font-bold text-blue-800">추천 복구: {recommendedRunbook.chainId}</p>
          <ul className="mt-1 space-y-1 text-[11px] text-blue-900">
            {recommendedRunbook.reasonLines.map((line, idx) => (
              <li key={`reason:${idx}`}>{line}</li>
            ))}
          </ul>
          {(() => {
            const chainId = recommendedRunbook.chainId;
            const state = chainStates[chainId];
            const expected = chainConfirmText(chainId);
            const needsConfirm = state.plan?.risk === "HIGH";
            const confirmed = !needsConfirm || state.confirmText.trim() === expected;
            return (
              <div className="mt-2 rounded-md border border-blue-200 bg-white p-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 border-blue-300 bg-white px-2.5 text-[11px] text-blue-700 hover:bg-blue-100"
                    disabled={state.running}
                    onClick={() => void previewChain(chainId)}
                  >
                    {state.running && state.phase === "preview" ? "계획 조회 중..." : "추천 체인 계획 보기"}
                  </Button>
                  {state.plan ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 border-blue-300 bg-blue-600 px-2.5 text-[11px] text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-200"
                      disabled={state.running || !confirmed}
                      onClick={() => void executeChain(chainId)}
                    >
                      {state.running && state.phase === "run" ? "추천 체인 실행 중..." : "실행"}
                    </Button>
                  ) : null}
                </div>
                {state.plan ? (
                  <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2">
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-semibold text-slate-800">{state.plan.title}</p>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${riskBadgeClass(state.plan.risk)}`}>
                        {state.plan.risk}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold text-slate-700">Steps</p>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[10px] text-slate-700">
                      {state.plan.steps.map((step, idx) => (
                        <li key={`recommended-plan-step:${step}:${idx}`}>{step}</li>
                      ))}
                    </ol>
                    {state.plan.impact.length > 0 ? (
                      <>
                        <p className="mt-2 text-[11px] font-semibold text-slate-700">Impact</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] text-slate-700">
                          {state.plan.impact.map((line, idx) => (
                            <li key={`recommended-plan-impact:${idx}`}>{line}</li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    {needsConfirm ? (
                      <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 p-2">
                        <p className="text-[10px] font-semibold text-rose-700">
                          HIGH 위험 체인입니다. 실행하려면 다음 문구를 정확히 입력하세요: <code>{expected}</code>
                        </p>
                        <input
                          type="text"
                          value={state.confirmText}
                          onChange={(event) => setChainConfirmText(chainId, event.currentTarget.value)}
                          className="mt-1 h-7 w-full rounded-md border border-rose-300 bg-white px-2 text-[11px] text-slate-800 outline-none focus:border-rose-500"
                          placeholder={expected}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {!state.running && state.message ? (
                  <DevUnlockShortcutMessage
                    className={`mt-2 text-[11px] font-semibold ${resultTextClass(state.ok)}`}
                    linkClassName={state.ok ? "text-emerald-700" : "text-rose-700"}
                    message={`${chainLabel(chainId)}: ${state.message}`}
                  />
                ) : null}
                {state.steps.length > 0 ? (
                  <ChainStepsTable steps={state.steps} />
                ) : null}
              </div>
            );
          })()}
        </div>
      ) : null}

      <div className="mt-4 border-t border-slate-200 pt-3">
        <p className="text-xs font-semibold text-slate-700">연쇄 Runbook</p>
        <div className="mt-2 grid gap-2">
          {CHAIN_ACTIONS.map((chain) => {
            const state = chainStates[chain.id];
            const expected = chainConfirmText(chain.id);
            const needsConfirm = state.plan?.risk === "HIGH";
            const confirmed = !needsConfirm || state.confirmText.trim() === expected;
            return (
              <div key={chain.id} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-semibold text-slate-800">{chain.label}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-[11px]"
                    disabled={state.running}
                    onClick={() => void previewChain(chain.id)}
                  >
                    {state.running && state.phase === "preview" ? "계획 조회 중..." : "계획 보기"}
                  </Button>
                  {state.plan ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-[11px]"
                      disabled={state.running || !confirmed}
                      onClick={() => void executeChain(chain.id)}
                    >
                      {state.running && state.phase === "run" ? "실행 중..." : "실행"}
                    </Button>
                  ) : null}
                </div>
                {state.plan ? (
                  <div className="mt-2 rounded-md border border-slate-200 bg-white p-2">
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-semibold text-slate-800">{state.plan.title}</p>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${riskBadgeClass(state.plan.risk)}`}>
                        {state.plan.risk}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-700">steps: {state.plan.steps.join(" -> ")}</p>
                    {state.plan.impact.length > 0 ? (
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] text-slate-700">
                        {state.plan.impact.map((line, idx) => (
                          <li key={`${chain.id}:impact:${idx}`}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                    {needsConfirm ? (
                      <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 p-2">
                        <p className="text-[10px] font-semibold text-rose-700">
                          HIGH 위험: <code>{expected}</code> 입력 후 실행 가능합니다.
                        </p>
                        <input
                          type="text"
                          value={state.confirmText}
                          onChange={(event) => setChainConfirmText(chain.id, event.currentTarget.value)}
                          className="mt-1 h-7 w-full rounded-md border border-rose-300 bg-white px-2 text-[11px] text-slate-800 outline-none focus:border-rose-500"
                          placeholder={expected}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {!state.running && state.message ? (
                  <DevUnlockShortcutMessage
                    className={`mt-2 text-[11px] font-semibold ${resultTextClass(state.ok)}`}
                    linkClassName={state.ok ? "text-emerald-700" : "text-rose-700"}
                    message={state.message}
                  />
                ) : null}
                {state.steps.length > 0 ? (
                  <ChainStepsTable steps={state.steps} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 border-t border-slate-200 pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-700">최근 Fix 실행</p>
          <button
            type="button"
            onClick={() => void loadHistory()}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            새로고침
          </button>
        </div>
        {historyLoading ? (
          <p className="mt-2 text-[11px] text-slate-500">히스토리 로딩 중...</p>
        ) : historyError ? (
          <p className="mt-2 text-[11px] font-semibold text-rose-700">{historyError}</p>
        ) : historyRows.length < 1 ? (
          <p className="mt-2 text-[11px] text-slate-500">최근 Fix 실행 기록이 없습니다.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-[11px]">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-2 py-2 text-left font-semibold">시간</th>
                  <th className="px-2 py-2 text-left font-semibold">fixId</th>
                  <th className="px-2 py-2 text-left font-semibold">ok</th>
                  <th className="px-2 py-2 text-left font-semibold">ms</th>
                  <th className="px-2 py-2 text-left font-semibold">로그</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                {historyRows.map((row) => {
                  const opened = Boolean(historyExpanded[row.id]);
                  return (
                    <Fragment key={row.id}>
                      <tr>
                        <td className="px-2 py-1.5">{formatDateTime(row.createdAt)}</td>
                        <td className="px-2 py-1.5">
                          <p>{row.fixId}</p>
                          {row.chainId ? (
                            <p className="mt-0.5 text-[10px] text-slate-500">chain: {row.chainId}</p>
                          ) : null}
                          {!row.ok && row.analysis?.summary ? (
                            <p className="mt-0.5 text-[10px] text-rose-700">{row.analysis.summary}</p>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5">{row.ok ? "true" : "false"}</td>
                        <td className="px-2 py-1.5">{row.tookMs}</td>
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setHistoryExpanded((prev) => ({ ...prev, [row.id]: !prev[row.id] }));
                            }}
                            className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            {opened ? "숨기기" : "보기"}
                          </button>
                        </td>
                      </tr>
                      {opened ? (
                        <tr>
                          <td colSpan={5} className="bg-slate-50 px-2 py-2">
                            {!row.ok && row.analysis ? (
                              <div className="mb-2 rounded-md border border-rose-200 bg-rose-50 p-2">
                                <p className="text-[11px] font-semibold text-rose-700">
                                  원인: {row.analysis.cause ?? "UNKNOWN"}
                                </p>
                                {row.analysis.summary ? (
                                  <p className="mt-0.5 text-[11px] text-rose-700">{row.analysis.summary}</p>
                                ) : null}
                                {Array.isArray(row.analysis.suggestedFixIds) && row.analysis.suggestedFixIds.length > 0 ? (
                                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                    {row.analysis.suggestedFixIds.filter((fixId) => isDoctorFixId(fixId)).map((fixId) => {
                                      const stateKey = historyFixStateKey(row.id, fixId);
                                      const state = fixStates[stateKey];
                                      return (
                                        <Button
                                          key={`${row.id}:${fixId}`}
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="h-6 px-2 text-[10px]"
                                          disabled={state?.running === true}
                                          onClick={() => void runFix(fixId, stateKey)}
                                        >
                                          {state?.running ? "실행 중..." : `${fixId} 추천 Fix 실행`}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                ) : null}
                                {Array.isArray(row.analysis.suggestedFixIds)
                                  ? row.analysis.suggestedFixIds.filter((fixId) => isDoctorFixId(fixId)).map((fixId) => {
                                    const stateKey = historyFixStateKey(row.id, fixId);
                                    const state = fixStates[stateKey];
                                    if (!state || state.running) return null;
                                    return (
                                      <div key={`${stateKey}:result`} className="mt-2 rounded-md border border-slate-200 bg-white p-2">
                                        <DevUnlockShortcutMessage
                                          className={`text-[11px] font-semibold ${state.ok ? "text-emerald-700" : "text-rose-700"}`}
                                          linkClassName={state.ok ? "text-emerald-700" : "text-rose-700"}
                                          message={state.message}
                                        />
                                        {state.stdoutTail ? (
                                          <pre className="mt-1 whitespace-pre-wrap text-[10px] text-slate-700">{state.stdoutTail}</pre>
                                        ) : null}
                                        {state.stderrTail ? (
                                          <pre className="mt-1 whitespace-pre-wrap text-[10px] text-rose-700">{state.stderrTail}</pre>
                                        ) : null}
                                      </div>
                                    );
                                  })
                                  : null}
                              </div>
                            ) : null}
                            {row.errorCode || row.errorMessage ? (
                              <p className="mb-1 text-[11px] font-semibold text-rose-700">
                                {row.errorCode ?? "ERROR"}: {row.errorMessage ?? "-"}
                              </p>
                            ) : null}
                            {Array.isArray(row.steps) && row.steps.length > 0 ? (
                              <div className="mb-2 rounded-md border border-slate-200 bg-white p-2">
                                <p className="text-[11px] font-semibold text-slate-700">체인 단계</p>
                                <ul className="mt-1 space-y-1 text-[10px] text-slate-700">
                                  {row.steps.map((step, idx) => (
                                    <li key={`${row.id}:${step.fixId}:${idx}`} className="rounded border border-slate-200 px-2 py-1">
                                      <p>
                                        {step.fixId} / {step.ok ? "ok" : "failed"} / {step.tookMs}ms
                                      </p>
                                      {step.errorCode || step.errorMessage ? (
                                        <p className="text-rose-700">{step.errorCode ?? "ERROR"}: {step.errorMessage ?? "-"}</p>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                            {row.stdoutTail ? (
                              <pre className="whitespace-pre-wrap text-[10px] text-slate-700">{row.stdoutTail}</pre>
                            ) : null}
                            {row.stderrTail ? (
                              <pre className="mt-1 whitespace-pre-wrap text-[10px] text-rose-700">{row.stderrTail}</pre>
                            ) : null}
                            {!row.stdoutTail && !row.stderrTail ? (
                              <p className="text-[10px] text-slate-500">출력 로그가 없습니다.</p>
                            ) : null}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-slate-200 pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-700">런북 요약</p>
          <button
            type="button"
            onClick={() => setShowRunbookSummary((prev) => !prev)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            {showRunbookSummary ? "요약 숨기기" : "요약 표시"}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">원문: docs/runbook.md</p>
        {showRunbookSummary ? (
          <ul className="mt-2 space-y-1 text-[11px] text-slate-600">
            {topActions.length > 0 ? (
              topActions.map((action) => (
                <li key={`${action.label}:${action.command}`}>
                  {action.label}: <code>{action.command}</code>
                </li>
              ))
            ) : (
              <li>표시할 조치 명령이 없습니다.</li>
            )}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}
