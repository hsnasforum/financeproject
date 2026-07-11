"use client";

import { useCallback, useRef } from "react";
import { createInitialStepStatuses } from "@/app/planning/_lib/runPipeline";
import { buildWorkspaceCompletedRunState } from "@/app/planning/_lib/workspaceRunResult";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { isApiBaseResponse } from "@/lib/http/apiContract";
import { t, type Locale } from "@/lib/planning/i18n";
import {
  parseProfileNormalizationDisclosure,
  type ProfileNormalizationDisclosure,
} from "@/lib/planning/v2/normalizationDisclosure";
import { type PreflightIssue } from "@/lib/planning/v2/preflight";
import { type PlanningRunRecord } from "@/lib/planning/store/types";
import {
  buildPlanningRunInput,
  formatPreflightIssue,
  type ParsedRunInputs,
  type RunInputScenario,
} from "@/components/planning/workspace/workspaceRuntimeHelpers";
import {
  type MountedRef,
  type useWorkspaceRuntimeStateBundle,
} from "@/components/planning/workspace/useWorkspaceRuntimeStateBundle";

type ApiError = {
  code?: string;
  message?: string;
  issues?: string[];
};

type ApiResponse<T> = {
  ok?: boolean;
  data?: T;
  meta?: Record<string, unknown>;
  error?: ApiError;
};

export type PendingPlanningRunRequest = {
  bodyText: string;
  idempotencyKey: string;
};

export function resolvePlanningRunIdempotencyRequest(input: {
  body: unknown;
  pending: PendingPlanningRunRequest | null;
  createKey: () => string;
}): PendingPlanningRunRequest {
  const bodyText = JSON.stringify(input.body) ?? "null";
  if (input.pending?.bodyText === bodyText) return input.pending;
  return {
    bodyText,
    idempotencyKey: input.createKey(),
  };
}

export function shouldReleasePendingPlanningRunRequest(
  response: Pick<Response, "ok" | "status">,
  payload: unknown,
): boolean {
  if (!isApiBaseResponse(payload)) return false;
  if (response.ok) return false;
  return response.status >= 400
    && response.status < 500
    && response.status !== 408
    && response.status !== 429;
}

type RunExecutionActionsInput = {
  locale: Locale;
  beginnerMode: boolean;
  selectedProfileId: string;
  runTitle: string;
  effectiveRunScenariosEnabled: boolean;
  effectiveRunMonteCarloEnabled: boolean;
  effectiveRunActionsEnabled: boolean;
  effectiveRunDebtEnabled: boolean;
  preflightHasBlockers: boolean;
  preflightBlockIssues: PreflightIssue[];
  preflightWarnIssues: PreflightIssue[];
  parseRunInputs: () => ParsedRunInputs | null;
  buildRunInputScenarioFromSelection: () => RunInputScenario | undefined;
  syncProfileIfNeeded: () => Promise<boolean>;
  pollRunUntilTerminal: (runId: string, seed?: PlanningRunRecord) => Promise<PlanningRunRecord | null>;
  handleSnapshotNotFound: (payload: ApiResponse<unknown> | null) => boolean;
  loadBaselineRuns: (profileId: string) => Promise<void>;
  pushWorkspaceError: (message: string) => void;
  pushWorkspaceNotice: (message: string) => void;
  setLastNormalizationDisclosure: (value: ProfileNormalizationDisclosure | null) => void;
  isMountedRef: MountedRef;
  state: ReturnType<typeof useWorkspaceRuntimeStateBundle>;
};

function truncate(text: string, max = 120): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
}

function resolveApiErrorMessage(locale: Locale, error: ApiError | undefined, fallbackMessage: string): string {
  const code = typeof error?.code === "string" ? error.code.trim().toUpperCase() : "";
  const mapped = code ? t(locale, code) : "";
  const raw = typeof error?.message === "string" ? error.message.trim() : "";
  const base = mapped && mapped !== code ? mapped : (raw || fallbackMessage);
  if (raw && mapped && mapped !== code && raw !== mapped) return `${base} (${truncate(raw)})`;
  return base;
}

function parseApiPayload<T>(
  locale: Locale,
  res: Response,
  payload: ApiResponse<T> | null,
  fallbackMessage: string,
): { ok: boolean; errorMessage: string } {
  if (!isApiBaseResponse(payload)) {
    return {
      ok: false,
      errorMessage: `${fallbackMessage}: 응답 파싱 실패`,
    };
  }
  const typedPayload = payload as ApiResponse<T>;
  if (!res.ok || !typedPayload.ok) {
    return {
      ok: false,
      errorMessage: resolveApiErrorMessage(locale, typedPayload.error, fallbackMessage),
    };
  }
  return { ok: true, errorMessage: "" };
}

export async function postPlanningRun(body: unknown, idempotencyKey: string): Promise<Response> {
  const request = () => fetch("/api/planning/v2/runs", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  try {
    return await request();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return request();
  }
}

export function useWorkspaceRunExecutionActions({
  locale,
  beginnerMode,
  selectedProfileId,
  runTitle,
  effectiveRunScenariosEnabled,
  effectiveRunMonteCarloEnabled,
  effectiveRunActionsEnabled,
  effectiveRunDebtEnabled,
  preflightHasBlockers,
  preflightBlockIssues,
  preflightWarnIssues,
  parseRunInputs,
  buildRunInputScenarioFromSelection,
  syncProfileIfNeeded,
  pollRunUntilTerminal,
  handleSnapshotNotFound,
  loadBaselineRuns,
  pushWorkspaceError,
  pushWorkspaceNotice,
  setLastNormalizationDisclosure,
  isMountedRef,
  state,
}: RunExecutionActionsInput): {
  runPlanAction: (options?: { scenario?: RunInputScenario }) => Promise<void>;
  runScenarioAction: () => Promise<void>;
} {
  const {
    runWarningConfirmed,
    setActiveTab,
    setPipelineStatuses,
    setRunResult,
    setRunning,
    setSavedRun,
    setShowAllActions,
  } = state;

  const runActionPromiseRef = useRef<Promise<void> | null>(null);
  const pendingRequestRef = useRef<PendingPlanningRunRequest | null>(null);

  const executePlanningRun = useCallback(async (options?: { scenario?: RunInputScenario }): Promise<void> => {
    if (preflightHasBlockers) {
      const details = preflightBlockIssues.map((issue) => `- [${issue.code}] ${formatPreflightIssue(issue)}`).join("\n");
      pushWorkspaceError(`사전 점검 오류를 먼저 해결하세요.\n${details}`);
      return;
    }
    if (preflightWarnIssues.length > 0 && !runWarningConfirmed) {
      pushWorkspaceError("사전 점검 경고를 확인한 뒤 실행·기록 저장 동의 체크를 켜주세요.");
      return;
    }
    if (!selectedProfileId) {
      pushWorkspaceError("실행할 프로필을 먼저 선택하세요.");
      return;
    }

    const parsed = parseRunInputs();
    if (!parsed) return;

    setRunning(true);
    setPipelineStatuses(createInitialStepStatuses());

    try {
      const synced = await syncProfileIfNeeded();
      if (!isMountedRef.current) return;
      if (!synced) return;

      const requestBody = withDevCsrf({
        profileId: selectedProfileId,
        title: options?.scenario?.title ? `${runTitle} · ${options.scenario.title}` : runTitle,
        input: buildPlanningRunInput({
          parsed,
          effectiveRunScenariosEnabled,
          effectiveRunActionsEnabled,
          effectiveRunDebtEnabled,
          effectiveRunMonteCarloEnabled,
          ...(options?.scenario ? { scenario: options.scenario } : {}),
        }),
      });
      const idempotencyRequest = resolvePlanningRunIdempotencyRequest({
        body: requestBody,
        pending: pendingRequestRef.current,
        createKey: () => crypto.randomUUID(),
      });
      pendingRequestRef.current = idempotencyRequest;
      const response = await postPlanningRun(requestBody, idempotencyRequest.idempotencyKey);
      const payload = (await response.json().catch(() => null)) as ApiResponse<PlanningRunRecord> | null;
      if (
        pendingRequestRef.current === idempotencyRequest
        && shouldReleasePendingPlanningRunRequest(response, payload)
      ) {
        pendingRequestRef.current = null;
      }
      if (!isMountedRef.current) return;
      if (handleSnapshotNotFound(payload)) return;
      const parsedPayload = parseApiPayload(locale, response, payload, "실행 요청에 실패했습니다.");
      if (!parsedPayload.ok) {
        pushWorkspaceError(parsedPayload.errorMessage);
        return;
      }
      const normalizationFromRunMeta = parseProfileNormalizationDisclosure(payload?.meta?.normalization);
      if (normalizationFromRunMeta) {
        setLastNormalizationDisclosure(normalizationFromRunMeta);
      }

      const created = (payload as ApiResponse<PlanningRunRecord>).data;
      if (!created?.id) {
        pushWorkspaceError("실행 ID를 확인하지 못했습니다.");
        return;
      }
      const finalRun = await pollRunUntilTerminal(created.id, created);
      if (!isMountedRef.current) return;
      if (!finalRun) {
        pushWorkspaceError("실행 상태를 확인하지 못했습니다.");
        return;
      }
      if (pendingRequestRef.current === idempotencyRequest) {
        pendingRequestRef.current = null;
      }

      const completedRunState = buildWorkspaceCompletedRunState(finalRun);
      setRunResult(completedRunState.runResult);
      setSavedRun(finalRun);
      setPipelineStatuses(completedRunState.stepStatuses);
      if (selectedProfileId) {
        void loadBaselineRuns(selectedProfileId);
      }
      setActiveTab("summary");
      setShowAllActions(false);

      const runCompletedNotice = beginnerMode
        ? "첫 실행과 기록 저장을 완료했습니다. 이제 저장된 리포트를 확인하고 실행 기록에서 비교를 이어갈 수 있습니다."
        : "실행과 기록 저장을 완료했습니다.";
      if (completedRunState.notices.length > 0) {
        pushWorkspaceNotice([runCompletedNotice, ...completedRunState.notices.map((notice) => `- ${notice}`)].join("\n"));
      } else {
        pushWorkspaceNotice(runCompletedNotice);
      }
    } catch (error) {
      pushWorkspaceError(error instanceof Error ? error.message : "실행 중 오류가 발생했습니다.");
    } finally {
      if (!isMountedRef.current) return;
      setRunning(false);
    }
  }, [
    beginnerMode,
    effectiveRunActionsEnabled,
    effectiveRunDebtEnabled,
    effectiveRunMonteCarloEnabled,
    effectiveRunScenariosEnabled,
    handleSnapshotNotFound,
    isMountedRef,
    loadBaselineRuns,
    locale,
    parseRunInputs,
    pollRunUntilTerminal,
    preflightBlockIssues,
    preflightHasBlockers,
    preflightWarnIssues.length,
    pushWorkspaceError,
    pushWorkspaceNotice,
    runTitle,
    runWarningConfirmed,
    selectedProfileId,
    setActiveTab,
    setLastNormalizationDisclosure,
    setPipelineStatuses,
    setRunResult,
    setRunning,
    setSavedRun,
    setShowAllActions,
    syncProfileIfNeeded,
  ]);

  const runPlanAction = useCallback((options?: { scenario?: RunInputScenario }): Promise<void> => {
    const current = runActionPromiseRef.current;
    if (current) return current;

    const pending = executePlanningRun(options).finally(() => {
      if (runActionPromiseRef.current === pending) {
        runActionPromiseRef.current = null;
      }
    });
    runActionPromiseRef.current = pending;
    return pending;
  }, [executePlanningRun]);

  const runScenarioAction = useCallback(async (): Promise<void> => {
    const scenario = buildRunInputScenarioFromSelection();
    if (!scenario) {
      pushWorkspaceError("시나리오 템플릿을 먼저 선택하세요.");
      return;
    }
    await runPlanAction({ scenario });
  }, [buildRunInputScenarioFromSelection, pushWorkspaceError, runPlanAction]);

  return {
    runPlanAction,
    runScenarioAction,
  };
}
