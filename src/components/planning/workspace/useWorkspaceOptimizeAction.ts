"use client";

import { useCallback } from "react";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { isApiBaseResponse } from "@/lib/http/apiContract";
import { t, type Locale } from "@/lib/planning/i18n";
import { normalizePlanningResponse, type PlanningApiEngineEnvelope } from "@/lib/planning/api/contracts";
import { type AllocationPolicyId } from "@/lib/planning/v2/policy/types";
import {
  parseJsonText,
} from "@/components/planning/workspace/workspaceRuntimeHelpers";
import {
  type WorkspaceRunMeta as PlanningMeta,
} from "@/app/planning/_lib/workspaceRunResult";

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

type OptimizerCoreInputs = {
  profile: Record<string, unknown>;
  assumptions: Record<string, unknown>;
  horizon: number;
  policyId: AllocationPolicyId;
  snapshotId?: string;
};

type OptimizerResult = {
  meta?: PlanningMeta;
  engine: PlanningApiEngineEnvelope["engine"];
  engineSchemaVersion: number;
  candidates: Record<string, unknown>[];
};

type WorkspaceOptimizeActionInput = {
  locale: Locale;
  optimizerServerDisabled: boolean;
  optimizerConstraintsJson: string;
  optimizerKnobsJson: string;
  optimizerSearchJson: string;
  parseCoreInputs: () => OptimizerCoreInputs | null;
  handleSnapshotNotFound: (payload: ApiResponse<unknown> | null) => boolean;
  pushWorkspaceError: (message: string) => void;
  pushWorkspaceNotice: (message: string) => void;
  setRunningOptimize: (running: boolean) => void;
  setOptimizeResult: (result: OptimizerResult | null) => void;
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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function useWorkspaceOptimizeAction({
  locale,
  optimizerServerDisabled,
  optimizerConstraintsJson,
  optimizerKnobsJson,
  optimizerSearchJson,
  parseCoreInputs,
  handleSnapshotNotFound,
  pushWorkspaceError,
  pushWorkspaceNotice,
  setRunningOptimize,
  setOptimizeResult,
}: WorkspaceOptimizeActionInput): () => Promise<void> {
  return useCallback(async (): Promise<void> => {
    const core = parseCoreInputs();
    if (!core) return;
    if (optimizerServerDisabled) {
      pushWorkspaceError("서버 설정으로 Optimizer 기능이 비활성화되어 있습니다.");
      return;
    }

    const constraintsParsed = parseJsonText<Record<string, unknown>>("Optimizer constraints", optimizerConstraintsJson);
    if (!constraintsParsed.value) {
      pushWorkspaceError(constraintsParsed.error);
      return;
    }
    const knobsParsed = parseJsonText<Record<string, unknown>>("Optimizer knobs", optimizerKnobsJson);
    if (!knobsParsed.value) {
      pushWorkspaceError(knobsParsed.error);
      return;
    }
    const searchParsed = parseJsonText<Record<string, unknown>>("Optimizer search", optimizerSearchJson);
    if (!searchParsed.value) {
      pushWorkspaceError(searchParsed.error);
      return;
    }

    setRunningOptimize(true);
    try {
      const res = await fetch("/api/planning/v2/optimize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          profile: core.profile,
          horizonMonths: core.horizon,
          assumptions: core.assumptions,
          ...(core.snapshotId ? { snapshotId: core.snapshotId } : {}),
          constraints: constraintsParsed.value,
          knobs: knobsParsed.value,
          search: searchParsed.value,
        })),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<Record<string, unknown>> | null;
      if (handleSnapshotNotFound(payload)) return;
      const parsedPayload = parseApiPayload(locale, res, payload, "Optimizer 실행에 실패했습니다.");
      if (!parsedPayload.ok) {
        pushWorkspaceError(parsedPayload.errorMessage);
        return;
      }
      const typedPayload = payload as ApiResponse<Record<string, unknown>>;

      const normalized = normalizePlanningResponse(asRecord(typedPayload.data));
      const rows = asArray(asRecord(normalized.data).candidates).map((entry) => asRecord(entry));
      setOptimizeResult({
        meta: asRecord(typedPayload.meta) as PlanningMeta,
        engine: normalized.engine,
        engineSchemaVersion: normalized.engineSchemaVersion,
        candidates: rows,
      });
      pushWorkspaceNotice(`Optimizer 후보 ${rows.length}개를 생성했습니다.`);
    } catch (error) {
      pushWorkspaceError(error instanceof Error ? error.message : "Optimizer 실행 중 오류가 발생했습니다.");
    } finally {
      setRunningOptimize(false);
    }
  }, [
    handleSnapshotNotFound,
    locale,
    optimizerConstraintsJson,
    optimizerKnobsJson,
    optimizerSearchJson,
    optimizerServerDisabled,
    parseCoreInputs,
    pushWorkspaceError,
    pushWorkspaceNotice,
    setOptimizeResult,
    setRunningOptimize,
  ]);
}
