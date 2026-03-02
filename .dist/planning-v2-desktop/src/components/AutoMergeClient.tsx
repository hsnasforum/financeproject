"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { mergePullRequestAction } from "@/app/ops/auto-merge/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import {
  AUTO_MERGE_ARM_SESSION_KEY,
  AUTO_MERGE_ARM_SESSION_VERSION,
  computeNextPollInterval,
  parseArmPersistPayload,
  pruneArmedState,
  type AutoMergeArmPersistEntry,
} from "@/lib/github/autoMergeArmState";
import type { AutoMergeViewCandidate } from "@/lib/github/autoMergeView";

type AutoMergeClientProps = {
  csrf: string;
  candidates: AutoMergeViewCandidate[];
  loadError: string;
  requiredChecks: string[];
  confirmTemplate: string;
  requiredLabel: string;
  autoMergeEnabled: boolean;
  autoMergeEnvEnabled: boolean;
  autoMergePolicyEnabled: boolean;
  mergeMethod: "squash" | "merge" | "rebase";
  armDefaultPollSeconds: number;
  armMaxConcurrentPolls: number;
};

type EligibilityPayload = {
  ok?: boolean;
  eligible?: boolean;
  reasonCode?: string;
  reasonMessage?: string;
  expectedConfirm?: string;
  headSha?: string;
};

type EligibilityOutcome = {
  eligible: boolean;
  reasonCode: string;
  reasonMessage: string;
  expectedConfirm: string;
  headSha: string;
  requestError: boolean;
};

type ArmStatus = {
  polling: boolean;
  lastCheckedAt: string;
  reasonCode: string;
  reasonMessage: string;
  eligible: boolean;
  currentIntervalMs: number;
};

type PollMeta = {
  nextPollAt: number;
  backoffMs: number;
};

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "-";
  return new Date(parsed).toLocaleString("ko-KR", { hour12: false });
}

function formatTime(value: Date): string {
  return value.toLocaleTimeString("ko-KR", { hour12: false });
}

function badgeClass(state: "PASS" | "PENDING" | "FAIL" | "UNKNOWN"): string {
  if (state === "PASS") return "bg-emerald-100 text-emerald-700";
  if (state === "FAIL") return "bg-rose-100 text-rose-700";
  if (state === "UNKNOWN") return "bg-slate-200 text-slate-700";
  return "bg-amber-100 text-amber-800";
}

function checkStateLabel(state: "PASS" | "PENDING" | "FAIL" | "UNKNOWN"): "PASS" | "PENDING" | "FAIL" | "UNKNOWN" {
  return state;
}

function normalizePrNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.trunc(parsed);
}

function toPersistArmedMap(entries: Record<number, AutoMergeArmPersistEntry>): Record<string, AutoMergeArmPersistEntry> {
  const rows: Record<string, AutoMergeArmPersistEntry> = {};
  for (const [rawKey, value] of Object.entries(entries)) {
    const prNumber = normalizePrNumber(rawKey);
    if (!prNumber) continue;
    rows[String(prNumber)] = value;
  }
  return rows;
}

function toNumericArmedMap(entries: Record<string, AutoMergeArmPersistEntry>): Record<number, AutoMergeArmPersistEntry> {
  const rows: Record<number, AutoMergeArmPersistEntry> = {};
  for (const [rawKey, value] of Object.entries(entries)) {
    const prNumber = normalizePrNumber(rawKey);
    if (!prNumber) continue;
    rows[prNumber] = value;
  }
  return rows;
}

function sameArmedMap(a: Record<number, AutoMergeArmPersistEntry>, b: Record<number, AutoMergeArmPersistEntry>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    const left = a[Number(key)] as AutoMergeArmPersistEntry;
    const right = b[Number(key)] as AutoMergeArmPersistEntry;
    if (
      left.expectedHeadSha !== right.expectedHeadSha
      || left.confirmText !== right.confirmText
      || left.armedAt !== right.armedAt
      || left.lastCheckAt !== right.lastCheckAt
      || left.lastReasonCode !== right.lastReasonCode
    ) {
      return false;
    }
  }
  return true;
}

function toStatusMessage(reasonCode: string, fallback: string): string {
  if (!fallback) {
    if (reasonCode === "ELIGIBLE") return "머지 가능한 상태입니다.";
    if (reasonCode === "CHECKS_PENDING") return "체크 대기 중";
    if (reasonCode === "CHECKS_FAIL") return "체크 실패 또는 누락";
    if (reasonCode === "LABEL_MISSING") return "필수 라벨 누락";
    if (reasonCode === "DISABLED") return "AUTO_MERGE_DISABLED";
  }
  return fallback || "상태 확인 필요";
}

function normalizeEligibilityOutcome(
  candidate: AutoMergeViewCandidate,
  payload: EligibilityPayload | null,
  responseOk: boolean,
  requestError: boolean,
): EligibilityOutcome {
  const reasonCode = (typeof payload?.reasonCode === "string" ? payload.reasonCode : "UNKNOWN").trim() || "UNKNOWN";
  const reasonMessageRaw = (typeof payload?.reasonMessage === "string" ? payload.reasonMessage : "").trim();
  const expectedConfirm = (typeof payload?.expectedConfirm === "string" ? payload.expectedConfirm : candidate.expectedConfirmText).trim();
  const headSha = (typeof payload?.headSha === "string" ? payload.headSha : candidate.headSha).trim();
  const eligible = responseOk && payload?.ok === true && payload?.eligible === true;

  return {
    eligible,
    reasonCode,
    reasonMessage: requestError
      ? "일시적 오류로 재시도 대기 중"
      : toStatusMessage(reasonCode, reasonMessageRaw),
    expectedConfirm,
    headSha,
    requestError,
  };
}

async function fetchEligibility(
  prNumber: number,
  expectedHeadSha: string,
  csrf: string,
): Promise<{
  responseOk: boolean;
  payload: EligibilityPayload | null;
  requestError: boolean;
  errorMessage: string;
}> {
  try {
    const endpoint = `/api/ops/auto-merge/eligibility?prNumber=${encodeURIComponent(String(prNumber))}&expectedHeadSha=${encodeURIComponent(expectedHeadSha)}&csrf=${encodeURIComponent(csrf)}`;
    const response = await fetch(endpoint, { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as EligibilityPayload | null;
    if (!response.ok) {
      const message = (typeof payload?.reasonMessage === "string" ? payload.reasonMessage : "").trim() || "상태 조회 실패";
      return {
        responseOk: false,
        payload,
        requestError: true,
        errorMessage: message,
      };
    }

    return {
      responseOk: true,
      payload,
      requestError: false,
      errorMessage: "",
    };
  } catch (error) {
    return {
      responseOk: false,
      payload: null,
      requestError: true,
      errorMessage: error instanceof Error ? error.message : "상태 조회 오류",
    };
  }
}

export function AutoMergeClient(props: AutoMergeClientProps) {
  const router = useRouter();
  const [pendingPr, setPendingPr] = useState<number | null>(null);
  const [mergePending, startMergeTransition] = useTransition();
  const [refreshPending, startRefreshTransition] = useTransition();
  const [confirmByPr, setConfirmByPr] = useState<Record<number, string>>({});
  const [armByPr, setArmByPr] = useState<Record<number, AutoMergeArmPersistEntry>>({});
  const [armStatusByPr, setArmStatusByPr] = useState<Record<number, ArmStatus>>({});
  const [recheckPendingByPr, setRecheckPendingByPr] = useState<Record<number, boolean>>({});
  const [batchPending, setBatchPending] = useState<"ARM_ALL" | "DISARM_ALL" | "PRUNE" | null>(null);

  const hasCsrf = props.csrf.trim().length > 0;
  const baseIntervalMs = Math.max(5_000, Math.min(120_000, Math.trunc(props.armDefaultPollSeconds * 1000)));
  const maxConcurrentPolls = Math.max(1, Math.min(10, Math.trunc(props.armMaxConcurrentPolls)));
  const requiredChecksLabel = useMemo(() => props.requiredChecks.join(", ") || "-", [props.requiredChecks]);
  const candidatesByPr = useMemo(() => {
    const rows = new Map<number, AutoMergeViewCandidate>();
    for (const candidate of props.candidates) rows.set(candidate.number, candidate);
    return rows;
  }, [props.candidates]);

  const pollingInFlightRef = useRef(false);
  const mergeInFlightRef = useRef<Record<number, boolean>>({});
  const pollMetaRef = useRef<Record<number, PollMeta>>({});
  const lastErrorToastRef = useRef<Record<number, string>>({});
  const restoredRef = useRef(false);
  const confirmByPrRef = useRef(confirmByPr);
  const armByPrRef = useRef(armByPr);

  useEffect(() => {
    confirmByPrRef.current = confirmByPr;
  }, [confirmByPr]);

  useEffect(() => {
    armByPrRef.current = armByPr;
  }, [armByPr]);

  const persistArmedState = useCallback((nextArmByPr: Record<number, AutoMergeArmPersistEntry>) => {
    if (typeof window === "undefined") return;
    const payload = {
      version: AUTO_MERGE_ARM_SESSION_VERSION,
      armed: toPersistArmedMap(nextArmByPr),
    };
    window.sessionStorage.setItem(AUTO_MERGE_ARM_SESSION_KEY, JSON.stringify(payload));
  }, []);

  const applyArmPrune = useCallback((notify: boolean) => {
    const pruned = pruneArmedState(
      toPersistArmedMap(armByPrRef.current),
      props.candidates.map((candidate) => ({ number: candidate.number, headSha: candidate.headSha })),
    );
    const nextArmByPr = toNumericArmedMap(pruned.armed);

    if (!sameArmedMap(armByPrRef.current, nextArmByPr)) {
      armByPrRef.current = nextArmByPr;
      setArmByPr(nextArmByPr);
      setArmStatusByPr((prev) => {
        const next: Record<number, ArmStatus> = {};
        for (const [rawPr, status] of Object.entries(prev)) {
          const prNumber = normalizePrNumber(rawPr);
          if (!prNumber || !nextArmByPr[prNumber]) continue;
          next[prNumber] = status;
        }
        return next;
      });
      persistArmedState(nextArmByPr);
    }

    for (const pr of [...pruned.removedMissing, ...pruned.removedShaMismatch]) {
      delete pollMetaRef.current[pr];
      delete lastErrorToastRef.current[pr];
    }

    if (notify && pruned.removedMissing.length > 0) {
      window.alert(`ARM 항목 정리: 목록에서 사라진 PR(${pruned.removedMissing.join(", ")})을 해제했습니다.`);
    }
    if (notify && pruned.removedShaMismatch.length > 0) {
      window.alert(`ARM 자동 해제: head SHA 변경(PR ${pruned.removedShaMismatch.join(", ")})`);
    }
  }, [persistArmedState, props.candidates]);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (typeof window === "undefined") return;

    const parsed = parseArmPersistPayload(window.sessionStorage.getItem(AUTO_MERGE_ARM_SESSION_KEY));
    const pruned = pruneArmedState(
      parsed.armed,
      props.candidates.map((candidate) => ({ number: candidate.number, headSha: candidate.headSha })),
    );
    const restoredArmed = toNumericArmedMap(pruned.armed);

    if (Object.keys(restoredArmed).length > 0) {
      armByPrRef.current = restoredArmed;
      setArmByPr(restoredArmed);
      setConfirmByPr((prev) => {
        const next = { ...prev };
        for (const [rawPr, entry] of Object.entries(restoredArmed)) {
          const prNumber = normalizePrNumber(rawPr);
          if (!prNumber) continue;
          next[prNumber] = entry.confirmText;
        }
        return next;
      });
      setArmStatusByPr((prev) => {
        const next = { ...prev };
        for (const [rawPr, entry] of Object.entries(restoredArmed)) {
          const prNumber = normalizePrNumber(rawPr);
          if (!prNumber) continue;
          next[prNumber] = {
            polling: false,
            lastCheckedAt: entry.lastCheckAt ? formatTime(new Date(entry.lastCheckAt)) : "",
            reasonCode: entry.lastReasonCode || "UNKNOWN",
            reasonMessage: entry.lastReasonCode ? `복원됨 (${entry.lastReasonCode})` : "복원됨",
            eligible: false,
            currentIntervalMs: baseIntervalMs,
          };
          pollMetaRef.current[prNumber] = {
            nextPollAt: 0,
            backoffMs: 0,
          };
        }
        return next;
      });
    }

    window.sessionStorage.setItem(
      AUTO_MERGE_ARM_SESSION_KEY,
      JSON.stringify({
        version: AUTO_MERGE_ARM_SESSION_VERSION,
        armed: pruned.armed,
      }),
    );

    if (pruned.removedShaMismatch.length > 0) {
      window.alert(`ARM 자동 해제: head SHA 변경(PR ${pruned.removedShaMismatch.join(", ")})`);
    }
  }, [baseIntervalMs, props.candidates]);

  useEffect(() => {
    applyArmPrune(true);
  }, [applyArmPrune, props.candidates]);

  const runMerge = useCallback(async (input: {
    candidate: AutoMergeViewCandidate;
    expectedHeadSha: string;
    confirmText: string;
  }): Promise<void> => {
    if (mergeInFlightRef.current[input.candidate.number]) return;
    mergeInFlightRef.current[input.candidate.number] = true;
    setPendingPr(input.candidate.number);
    try {
      const result = await mergePullRequestAction({
        prNumber: input.candidate.number,
        expectedHeadSha: input.expectedHeadSha,
        confirmText: input.confirmText,
      });
      window.alert(result.message);
      if (result.ok && result.merged) {
        setConfirmByPr((prev) => ({
          ...prev,
          [input.candidate.number]: "",
        }));
        setArmByPr((prev) => {
          const next = { ...prev };
          delete next[input.candidate.number];
          armByPrRef.current = next;
          persistArmedState(next);
          return next;
        });
        setArmStatusByPr((prev) => {
          const next = { ...prev };
          delete next[input.candidate.number];
          return next;
        });
        delete pollMetaRef.current[input.candidate.number];
        delete lastErrorToastRef.current[input.candidate.number];
        router.refresh();
      }
    } finally {
      mergeInFlightRef.current[input.candidate.number] = false;
      setPendingPr(null);
    }
  }, [persistArmedState, router]);

  const runRecheckNow = useCallback(async (candidate: AutoMergeViewCandidate, expectedHeadSha: string) => {
    if (!hasCsrf) {
      window.alert("Dev unlock/CSRF가 필요합니다. /ops/rules에서 unlock 후 다시 시도해 주세요.");
      return null;
    }

    setRecheckPendingByPr((prev) => ({ ...prev, [candidate.number]: true }));
    try {
      const fetched = await fetchEligibility(candidate.number, expectedHeadSha, props.csrf);
      const outcome = normalizeEligibilityOutcome(candidate, fetched.payload, fetched.responseOk, fetched.requestError);
      const now = new Date();
      const previousBackoff = pollMetaRef.current[candidate.number]?.backoffMs ?? 0;
      const intervalRule = computeNextPollInterval({
        reasonCode: outcome.reasonCode,
        requestError: outcome.requestError,
        previousBackoffMs: previousBackoff,
        baseIntervalMs,
      });
      pollMetaRef.current[candidate.number] = {
        nextPollAt: Date.now() + intervalRule.intervalMs,
        backoffMs: intervalRule.nextBackoffMs,
      };

      setArmStatusByPr((prev) => ({
        ...prev,
        [candidate.number]: {
          polling: false,
          lastCheckedAt: formatTime(now),
          reasonCode: outcome.reasonCode,
          reasonMessage: outcome.reasonMessage,
          eligible: outcome.eligible,
          currentIntervalMs: intervalRule.intervalMs,
        },
      }));

      setArmByPr((prev) => {
        const current = prev[candidate.number];
        if (!current) return prev;
        const next = {
          ...prev,
          [candidate.number]: {
            ...current,
            expectedHeadSha: outcome.headSha || current.expectedHeadSha,
            lastCheckAt: now.toISOString(),
            lastReasonCode: outcome.reasonCode,
          },
        };
        armByPrRef.current = next;
        persistArmedState(next);
        return next;
      });

      if (fetched.requestError) {
        const last = lastErrorToastRef.current[candidate.number] || "";
        if (last !== fetched.errorMessage) {
          lastErrorToastRef.current[candidate.number] = fetched.errorMessage;
          window.alert(`PR #${candidate.number} 재검증 오류: ${fetched.errorMessage}`);
        }
      } else {
        delete lastErrorToastRef.current[candidate.number];
      }

      return outcome;
    } finally {
      setRecheckPendingByPr((prev) => ({ ...prev, [candidate.number]: false }));
    }
  }, [baseIntervalMs, hasCsrf, persistArmedState, props.csrf]);

  const runMergeWithPreflight = useCallback(async (input: {
    candidate: AutoMergeViewCandidate;
    expectedHeadSha: string;
    confirmText: string;
  }): Promise<void> => {
    const preflight = await runRecheckNow(input.candidate, input.expectedHeadSha);
    if (!preflight) return;

    if (!preflight.eligible) {
      window.alert(`현재 상태로는 병합할 수 없습니다. (${preflight.reasonCode}: ${preflight.reasonMessage})`);
      return;
    }

    if (input.confirmText !== preflight.expectedConfirm) {
      window.alert(`확인 문구가 일치하지 않습니다: ${preflight.expectedConfirm}`);
      setArmByPr((prev) => {
        if (!prev[input.candidate.number]) return prev;
        const next = { ...prev };
        delete next[input.candidate.number];
        armByPrRef.current = next;
        persistArmedState(next);
        return next;
      });
      return;
    }

    await runMerge({
      candidate: input.candidate,
      expectedHeadSha: preflight.headSha || input.expectedHeadSha,
      confirmText: input.confirmText,
    });
  }, [persistArmedState, runMerge, runRecheckNow]);

  async function onMerge(candidate: AutoMergeViewCandidate) {
    const confirmText = confirmByPrRef.current[candidate.number] ?? "";
    const armEntry = armByPrRef.current[candidate.number];

    if (!hasCsrf) {
      window.alert("Dev unlock/CSRF가 필요합니다. /ops/rules에서 unlock 후 다시 시도해 주세요.");
      return;
    }

    if (!props.autoMergeEnabled) {
      window.alert("AUTO_MERGE_DISABLED: 현재 자동 병합 기능이 꺼져 있습니다.");
      return;
    }

    if (confirmText !== candidate.expectedConfirmText) {
      window.alert(`확인 문구가 일치하지 않습니다: ${candidate.expectedConfirmText}`);
      return;
    }

    startMergeTransition(() => {
      void runMergeWithPreflight({
        candidate,
        expectedHeadSha: armEntry?.expectedHeadSha || candidate.headSha,
        confirmText,
      }).catch((error) => {
        window.alert(error instanceof Error ? error.message : "Merge 실행 중 오류가 발생했습니다.");
      });
    });
  }

  const pollArmedCandidates = useCallback(async () => {
    const armedEntries = Object.entries(armByPrRef.current)
      .map(([rawPr, entry]) => ({ prNumber: normalizePrNumber(rawPr), entry }))
      .filter((row) => row.prNumber > 0);

    if (armedEntries.length < 1 || !props.autoMergeEnabled || !hasCsrf) return;
    if (pollingInFlightRef.current) return;

    const now = Date.now();
    const dueEntries = armedEntries.filter((row) => {
      const meta = pollMetaRef.current[row.prNumber];
      if (!meta) return true;
      return now >= meta.nextPollAt;
    });

    if (dueEntries.length < 1) return;

    pollingInFlightRef.current = true;
    const concurrency = maxConcurrentPolls;
    let cursor = 0;

    const runWorker = async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= dueEntries.length) return;

        const target = dueEntries[index];
        if (!target) return;
        const candidate = candidatesByPr.get(target.prNumber);
        if (!candidate) continue;

        setArmStatusByPr((prev) => ({
          ...prev,
          [target.prNumber]: {
            polling: true,
            lastCheckedAt: prev[target.prNumber]?.lastCheckedAt ?? "",
            reasonCode: prev[target.prNumber]?.reasonCode ?? "POLLING",
            reasonMessage: prev[target.prNumber]?.reasonMessage ?? "확인 중",
            eligible: prev[target.prNumber]?.eligible ?? false,
            currentIntervalMs: prev[target.prNumber]?.currentIntervalMs ?? baseIntervalMs,
          },
        }));

        const fetched = await fetchEligibility(target.prNumber, target.entry.expectedHeadSha, props.csrf);
        const outcome = normalizeEligibilityOutcome(candidate, fetched.payload, fetched.responseOk, fetched.requestError);
        const previousBackoff = pollMetaRef.current[target.prNumber]?.backoffMs ?? 0;
        const intervalRule = computeNextPollInterval({
          reasonCode: outcome.reasonCode,
          requestError: outcome.requestError,
          previousBackoffMs: previousBackoff,
          baseIntervalMs,
        });
        pollMetaRef.current[target.prNumber] = {
          nextPollAt: Date.now() + intervalRule.intervalMs,
          backoffMs: intervalRule.nextBackoffMs,
        };

        const nowDate = new Date();
        setArmStatusByPr((prev) => ({
          ...prev,
          [target.prNumber]: {
            polling: false,
            lastCheckedAt: formatTime(nowDate),
            reasonCode: outcome.reasonCode,
            reasonMessage: outcome.reasonMessage,
            eligible: outcome.eligible,
            currentIntervalMs: intervalRule.intervalMs,
          },
        }));

        setArmByPr((prev) => {
          const current = prev[target.prNumber];
          if (!current) return prev;
          const next = {
            ...prev,
            [target.prNumber]: {
              ...current,
              expectedHeadSha: outcome.headSha || current.expectedHeadSha,
              lastCheckAt: nowDate.toISOString(),
              lastReasonCode: outcome.reasonCode,
            },
          };
          armByPrRef.current = next;
          persistArmedState(next);
          return next;
        });

        if (fetched.requestError) {
          const last = lastErrorToastRef.current[target.prNumber] || "";
          if (last !== fetched.errorMessage) {
            lastErrorToastRef.current[target.prNumber] = fetched.errorMessage;
            window.alert(`PR #${target.prNumber} ARM 상태 조회 오류: ${fetched.errorMessage}`);
          }
          continue;
        }
        delete lastErrorToastRef.current[target.prNumber];

        const latestConfirm = confirmByPrRef.current[target.prNumber] ?? "";
        if (
          outcome.eligible
          && latestConfirm === outcome.expectedConfirm
          && !mergeInFlightRef.current[target.prNumber]
        ) {
          await runMergeWithPreflight({
            candidate,
            expectedHeadSha: target.entry.expectedHeadSha,
            confirmText: latestConfirm,
          });
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(concurrency, dueEntries.length) }, () => runWorker()));
    } finally {
      pollingInFlightRef.current = false;
    }
  }, [baseIntervalMs, candidatesByPr, hasCsrf, maxConcurrentPolls, persistArmedState, props.autoMergeEnabled, props.csrf, runMergeWithPreflight]);

  useEffect(() => {
    const armedCount = Object.keys(armByPr).length;
    if (armedCount < 1) return;
    const timer = window.setInterval(() => {
      void pollArmedCandidates();
    }, 1000);
    void pollArmedCandidates();
    return () => {
      window.clearInterval(timer);
    };
  }, [armByPr, pollArmedCandidates]);

  async function handleCopyExpected(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      window.alert("확인 문구를 복사했습니다.");
    } catch {
      window.alert("복사에 실패했습니다. 수동으로 복사해 주세요.");
    }
  }

  function armDisabledReason(candidate: AutoMergeViewCandidate, confirmValue: string): string {
    if (!props.autoMergeEnabled) return "AUTO_MERGE_DISABLED";
    if (!hasCsrf) return "Dev unlock/CSRF 필요";
    if (!confirmValue.trim()) return "확인 문구 입력 필요";
    if (confirmValue !== candidate.expectedConfirmText) return "확인 문구 불일치";
    return "";
  }

  function upsertArm(candidate: AutoMergeViewCandidate, confirmText: string) {
    const nowIso = new Date().toISOString();
    const nextEntry: AutoMergeArmPersistEntry = {
      expectedHeadSha: candidate.headSha,
      confirmText,
      armedAt: nowIso,
      lastReasonCode: "UNKNOWN",
    };
    setArmByPr((prev) => {
      const next = {
        ...prev,
        [candidate.number]: nextEntry,
      };
      armByPrRef.current = next;
      persistArmedState(next);
      return next;
    });
    setArmStatusByPr((prev) => ({
      ...prev,
      [candidate.number]: {
        polling: false,
        lastCheckedAt: prev[candidate.number]?.lastCheckedAt ?? "",
        reasonCode: prev[candidate.number]?.reasonCode ?? "UNKNOWN",
        reasonMessage: prev[candidate.number]?.reasonMessage ?? "ARM 대기",
        eligible: prev[candidate.number]?.eligible ?? false,
        currentIntervalMs: prev[candidate.number]?.currentIntervalMs ?? baseIntervalMs,
      },
    }));
    pollMetaRef.current[candidate.number] = {
      nextPollAt: 0,
      backoffMs: 0,
    };
  }

  function removeArm(prNumber: number) {
    setArmByPr((prev) => {
      if (!prev[prNumber]) return prev;
      const next = { ...prev };
      delete next[prNumber];
      armByPrRef.current = next;
      persistArmedState(next);
      return next;
    });
    setArmStatusByPr((prev) => {
      const next = { ...prev };
      if (next[prNumber]) {
        next[prNumber] = {
          ...next[prNumber],
          polling: false,
          reasonMessage: "ARM 해제",
        };
      }
      return next;
    });
    delete pollMetaRef.current[prNumber];
    delete lastErrorToastRef.current[prNumber];
  }

  function handleBatchArmAllEligible() {
    if (batchPending) return;
    setBatchPending("ARM_ALL");
    try {
      let armedCount = 0;
      let skipped = 0;
      for (const candidate of props.candidates) {
        const liveEligible = armStatusByPr[candidate.number]?.eligible ?? candidate.eligibility.ok;
        if (!liveEligible) continue;
        const confirmValue = (confirmByPrRef.current[candidate.number] ?? "").trim();
        if (armDisabledReason(candidate, confirmValue)) {
          skipped += 1;
          continue;
        }
        upsertArm(candidate, confirmValue);
        armedCount += 1;
      }
      window.alert(`Batch ARM 완료: ${armedCount}건 적용, ${skipped}건 건너뜀(확인 문구/조건 미충족)`);
    } finally {
      setBatchPending(null);
    }
  }

  function handleBatchDisarmAll() {
    if (batchPending) return;
    setBatchPending("DISARM_ALL");
    try {
      setArmByPr({});
      armByPrRef.current = {};
      persistArmedState({});
      setArmStatusByPr((prev) => {
        const next = { ...prev };
        for (const rawPr of Object.keys(next)) {
          const prNumber = normalizePrNumber(rawPr);
          if (!prNumber) continue;
          next[prNumber] = {
            ...next[prNumber],
            polling: false,
            reasonMessage: "ARM 해제",
          };
        }
        return next;
      });
      pollMetaRef.current = {};
      lastErrorToastRef.current = {};
      window.alert("모든 ARM 대기를 해제했습니다.");
    } finally {
      setBatchPending(null);
    }
  }

  function handleBatchPrune() {
    if (batchPending) return;
    setBatchPending("PRUNE");
    try {
      applyArmPrune(true);
    } finally {
      setBatchPending(null);
    }
  }

  function handleRefreshNow() {
    startRefreshTransition(() => {
      router.refresh();
    });
  }

  return (
    <PageShell>
      <PageHeader
        title="Ops Auto Merge"
        description="CI 통과 + 확인 문구 검증을 통과한 PR만 안전하게 병합합니다. (Dev only)"
        action={(
          <div className="flex items-center gap-2">
            <Link href="/ops">
              <Button type="button" variant="outline" size="sm">Ops Hub</Button>
            </Link>
            <Link href="/ops/rules">
              <Button type="button" variant="outline" size="sm">Rules Ops</Button>
            </Link>
            <Link href="/ops/auto-merge/policy">
              <Button type="button" variant="outline" size="sm">Policy</Button>
            </Link>
          </div>
        )}
      />

      <Card>
        <h2 className="text-base font-black text-slate-900">Policy</h2>
        <p className="mt-2 text-sm text-slate-600">required checks: <span className="font-semibold">{requiredChecksLabel}</span></p>
        <p className="mt-1 text-sm text-slate-600">required label: <span className="font-semibold">{props.requiredLabel}</span></p>
        <p className="mt-1 text-sm text-slate-600">confirm template: <span className="font-semibold">{props.confirmTemplate}</span></p>
        <p className="mt-1 text-sm text-slate-600">merge method: <span className="font-semibold">{props.mergeMethod}</span></p>
        <p className="mt-1 text-sm text-slate-600">ARM default: <span className="font-semibold">{props.armDefaultPollSeconds}s</span> / max polls: <span className="font-semibold">{props.armMaxConcurrentPolls}</span></p>
        <p className="mt-1 text-sm text-slate-600">
          effective enabled: <span className="font-semibold">{props.autoMergeEnabled ? "true" : "false"}</span>
          {" "}(
          env: <span className="font-semibold">{props.autoMergeEnvEnabled ? "true" : "false"}</span>
          , policy: <span className="font-semibold">{props.autoMergePolicyEnabled ? "true" : "false"}</span>)
        </p>
        <p className="mt-1 text-xs text-slate-500">UI의 버튼 활성화는 편의 기능이며, 최종 병합 가능 여부는 서버 액션에서 다시 검증됩니다.</p>
        {!props.autoMergeEnabled ? (
          <p className="mt-3 text-sm font-semibold text-amber-700">
            AUTO_MERGE_DISABLED: env(AUTO_MERGE_ENABLED)와 policy.enabled가 모두 true일 때만 병합됩니다.
          </p>
        ) : null}
        {!hasCsrf ? (
          <p className="mt-3 text-sm font-semibold text-rose-600">Dev unlock/CSRF가 없습니다. /ops/rules에서 잠금 해제를 먼저 수행해 주세요.</p>
        ) : null}
        {props.loadError ? (
          <p className="mt-3 text-sm font-semibold text-rose-600">{props.loadError}</p>
        ) : null}
      </Card>

      <Card className="mt-6">
        <h2 className="text-base font-black text-slate-900">Batch Actions</h2>
        <p className="mt-1 text-xs text-slate-500">ARM은 이 탭에서만 유지됩니다. 조건: enabled=true + required label + checks success + confirm match + sha match</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={Boolean(batchPending) || mergePending || refreshPending} onClick={handleBatchArmAllEligible}>
            {batchPending === "ARM_ALL" ? "ARM 적용 중..." : "ARM all eligible"}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={Boolean(batchPending) || mergePending || refreshPending} onClick={handleBatchDisarmAll}>
            {batchPending === "DISARM_ALL" ? "해제 중..." : "Disarm all"}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={Boolean(batchPending) || mergePending || refreshPending} onClick={handleBatchPrune}>
            {batchPending === "PRUNE" ? "정리 중..." : "Prune stale"}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={Boolean(batchPending) || mergePending || refreshPending} onClick={handleRefreshNow}>
            {refreshPending ? "새로고침 중..." : "Refresh now"}
          </Button>
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="text-base font-black text-slate-900">Open PRs</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-semibold">PR</th>
                <th className="px-3 py-2 font-semibold">Head SHA</th>
                <th className="px-3 py-2 font-semibold">Checks</th>
                <th className="px-3 py-2 font-semibold">Eligibility</th>
                <th className="px-3 py-2 font-semibold">Merge</th>
              </tr>
            </thead>
            <tbody>
              {props.candidates.length < 1 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-slate-500">대상 PR이 없습니다.</td>
                </tr>
              ) : props.candidates.map((candidate) => {
                const confirmValue = confirmByPr[candidate.number] ?? "";
                const armEntry = armByPr[candidate.number];
                const armEnabled = Boolean(armEntry);
                const armStatus = armStatusByPr[candidate.number];
                const liveEligible = armStatus?.eligible ?? candidate.eligibility.ok;
                const liveReasonMessage = armStatus?.reasonMessage || (candidate.eligibility.ok ? "" : candidate.eligibility.reasons.join(", "));
                const confirmMatched = confirmValue === candidate.expectedConfirmText;
                const mergeDisabled = !props.autoMergeEnabled || !hasCsrf || !liveEligible || !confirmMatched || mergePending || pendingPr === candidate.number;
                const disabledReasons: string[] = [];
                if (!props.autoMergeEnabled) disabledReasons.push("AUTO_MERGE_DISABLED");
                if (!hasCsrf) disabledReasons.push("Dev unlock/CSRF 필요");
                if (!liveEligible) disabledReasons.push(liveReasonMessage || "서버 eligibility 미충족");
                if (!confirmMatched) disabledReasons.push("확인 문구 불일치");
                if (mergePending || pendingPr === candidate.number) disabledReasons.push("병합 작업 진행 중");
                const reasonId = `merge-disabled-reason-${candidate.number}`;
                const confirmInputId = `confirm-input-${candidate.number}`;
                const armReasonId = `arm-disabled-reason-${candidate.number}`;
                const armReason = armDisabledReason(candidate, confirmValue);
                const armToggleDisabled = Boolean(armReason) && !armEnabled;
                const intervalSec = Math.max(1, Math.round((armStatus?.currentIntervalMs ?? baseIntervalMs) / 1000));

                return (
                  <tr key={candidate.number} className="border-t border-slate-200 align-top">
                    <td className="px-3 py-2 text-slate-700">
                      <a href={candidate.prUrl} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 underline">
                        #{candidate.number} {candidate.title || "(no title)"}
                      </a>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {candidate.author || "-"} / {candidate.headRef || "-"} / {formatDateTime(candidate.updatedAt)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">state={candidate.state || "-"}{candidate.draft ? ", draft=true" : ""}</p>
                      <p className="mt-1 text-[11px] text-slate-500">labels: {candidate.labels.length > 0 ? candidate.labels.join(", ") : "-"}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                      <code>{candidate.headSha.slice(0, 7)}</code>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${badgeClass(candidate.checks.summary)}`}>
                        {checkStateLabel(candidate.checks.summary)}
                      </span>
                      <p className="mt-1 text-[11px] text-slate-600">
                        pass {candidate.checks.passed} / pending {candidate.checks.pending} / fail {candidate.checks.failed}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">source: {candidate.checks.source}</p>
                      <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">
                        {candidate.checks.items.map((item) => (
                          <li key={`${candidate.number}-${item.name}`}>
                            {item.name}: <span className="font-semibold">{item.state}</span> ({item.detail})
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        liveEligible ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                      }`}
                      >
                        {liveEligible ? "ELIGIBLE" : "BLOCKED"}
                      </span>
                      {!liveEligible ? (
                        <p className="mt-1 text-[11px] text-rose-700">{liveReasonMessage || "조건 미충족"}</p>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        disabled={Boolean(recheckPendingByPr[candidate.number]) || !hasCsrf}
                        onClick={() => {
                          void runRecheckNow(candidate, armEntry?.expectedHeadSha || candidate.headSha);
                        }}
                      >
                        {recheckPendingByPr[candidate.number] ? "Re-checking..." : "Re-check now"}
                      </Button>
                    </td>
                    <td className="px-3 py-2">
                      <label htmlFor={confirmInputId} className="sr-only">확인 문구 입력</label>
                      <p className="mb-1 text-[11px] text-slate-600">정확히 입력:</p>
                      <div className="mb-1 flex items-center gap-2">
                        <input
                          readOnly
                          value={candidate.expectedConfirmText}
                          className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 font-mono text-[11px] text-slate-700"
                          aria-label={`PR ${candidate.number} expected confirm text`}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => { void handleCopyExpected(candidate.expectedConfirmText); }}
                        >
                          복사
                        </Button>
                      </div>
                      <input
                        id={confirmInputId}
                        type="text"
                        className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none ring-emerald-200 transition focus:border-emerald-400 focus:ring"
                        value={confirmValue}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setConfirmByPr((prev) => ({
                            ...prev,
                            [candidate.number]: nextValue,
                          }));

                          const armed = armByPrRef.current[candidate.number];
                          if (armed && nextValue !== candidate.expectedConfirmText) {
                            removeArm(candidate.number);
                            window.alert(`PR #${candidate.number}: confirm mismatch로 ARM이 해제되었습니다.`);
                          }
                        }}
                        placeholder={candidate.expectedConfirmText}
                      />
                      <div className="mt-2">
                        <label className="mb-1 inline-flex items-center gap-2 text-[11px] text-slate-700">
                          <input
                            type="checkbox"
                            checked={armEnabled}
                            disabled={armToggleDisabled}
                            aria-describedby={armToggleDisabled ? armReasonId : undefined}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              if (checked) {
                                if (armReason) {
                                  window.alert(`ARM 활성화 불가: ${armReason}`);
                                  return;
                                }
                                upsertArm(candidate, confirmValue);
                              } else {
                                removeArm(candidate.number);
                              }
                            }}
                          />
                          ARM(조건 충족 시 자동 Merge)
                        </label>
                        <p className="mb-1 text-[11px] text-slate-500">
                          조건: enabled=true + label + checks success + confirm match + sha match
                        </p>
                        {armToggleDisabled ? (
                          <p id={armReasonId} className="mb-1 text-[11px] text-slate-500">ARM 비활성 사유: {armReason}</p>
                        ) : null}
                        {armEnabled ? (
                          <p className="mb-2 text-[11px] text-slate-600">
                            마지막 확인: {armStatus?.lastCheckedAt || "-"}
                            {" / "}
                            code: {armStatus?.reasonCode || "POLLING"}
                            {" / "}
                            {armStatus?.reasonMessage || "확인 중"}
                            {" / "}
                            다음 간격: {intervalSec}s
                          </p>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={mergeDisabled}
                          aria-describedby={mergeDisabled ? reasonId : undefined}
                          onClick={() => { void onMerge(candidate); }}
                        >
                          {pendingPr === candidate.number ? "병합 중..." : `Merge (${props.mergeMethod})`}
                        </Button>
                      </div>
                      {mergeDisabled ? (
                        <p id={reasonId} className="mt-1 text-[11px] text-slate-500">
                          비활성 사유: {disabledReasons.join(" / ")}
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] text-emerald-700">병합 가능: 서버에서 최종 재검증 후 실행됩니다.</p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </PageShell>
  );
}
