export type StepId = "simulate" | "scenarios" | "monteCarlo" | "actions" | "debtStrategy";

export type StepState = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";

export type StepStatus = {
  id: StepId;
  state: StepState;
  message?: string;
  startedAt?: number;
  endedAt?: number;
};

export type RunPipelineResult = {
  meta?: Record<string, unknown>;
  simulate?: Record<string, unknown>;
  scenarios?: Record<string, unknown>;
  monteCarlo?: Record<string, unknown>;
  actions?: Record<string, unknown>;
  debtStrategy?: Record<string, unknown>;
  stepStatuses: StepStatus[];
};

type ApiError = {
  code?: string;
  message?: string;
};

type ApiResponse<T> = {
  ok?: boolean;
  data?: T;
  meta?: Record<string, unknown>;
  error?: ApiError;
};

type ExecuteRunPipelineArgs = {
  profile: Record<string, unknown>;
  horizonMonths: number;
  assumptions: Record<string, unknown>;
  policyId: string;
  snapshotId?: string;
  monteCarlo: {
    paths: number;
    seed: number;
  };
  actions: {
    includeProducts: boolean;
    maxCandidatesPerAction: number;
  };
  debt: {
    offers: unknown[];
    options: {
      extraPaymentKrw?: number;
    };
  };
  toggles: {
    scenarios: boolean;
    monteCarlo: boolean;
    actions: boolean;
    debt: boolean;
  };
  flags: {
    monteCarloEnabled: boolean;
    includeProductsEnabled: boolean;
  };
  healthAck: boolean;
  decoratePayload?: (payload: Record<string, unknown>) => Record<string, unknown>;
  resolveErrorMessage?: (error: ApiError | undefined, fallbackMessage: string) => string;
  onStepStatus?: (statuses: StepStatus[]) => void;
  fetchFn?: typeof fetch;
  now?: () => number;
};

export class RunPipelineFatalError extends Error {
  code?: string;
  stepId: StepId;

  constructor(stepId: StepId, message: string, code?: string) {
    super(message);
    this.stepId = stepId;
    this.code = code;
  }
}

const STEP_ORDER: StepId[] = ["simulate", "scenarios", "monteCarlo", "actions", "debtStrategy"];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cloneStatuses(statuses: StepStatus[]): StepStatus[] {
  return statuses.map((row) => ({ ...row }));
}

function normalizeErrorCode(code: unknown): string | undefined {
  if (typeof code !== "string") return undefined;
  const trimmed = code.trim();
  if (!trimmed) return undefined;
  return trimmed.toUpperCase();
}

async function parseApiResponse<T>(res: Response): Promise<ApiResponse<T> | null> {
  try {
    const payload = await res.json();
    return payload && typeof payload === "object" ? payload as ApiResponse<T> : null;
  } catch {
    return null;
  }
}

function toMessage(
  resolveErrorMessage: ExecuteRunPipelineArgs["resolveErrorMessage"],
  error: ApiError | undefined,
  fallbackMessage: string,
): string {
  if (resolveErrorMessage) {
    return resolveErrorMessage(error, fallbackMessage);
  }
  const raw = typeof error?.message === "string" ? error.message.trim() : "";
  return raw || fallbackMessage;
}

export function createInitialStepStatuses(): StepStatus[] {
  return STEP_ORDER.map((id) => ({ id, state: "PENDING" }));
}

export async function executeRunPipeline(args: ExecuteRunPipelineArgs): Promise<RunPipelineResult> {
  const fetchFn = args.fetchFn ?? fetch;
  const now = args.now ?? (() => Date.now());
  const decoratePayload = args.decoratePayload ?? ((payload) => payload);

  const stepStatuses = createInitialStepStatuses();
  const emitStatuses = () => {
    args.onStepStatus?.(cloneStatuses(stepStatuses));
  };
  const updateStatus = (id: StepId, state: StepState, message?: string) => {
    const row = stepStatuses.find((entry) => entry.id === id);
    if (!row) return;
    row.state = state;
    row.message = message;
    if (state === "RUNNING") {
      row.startedAt = now();
      row.endedAt = undefined;
    } else if (state !== "PENDING") {
      if (typeof row.startedAt !== "number") row.startedAt = now();
      row.endedAt = now();
    }
    emitStatuses();
  };

  const result: RunPipelineResult = {
    stepStatuses,
  };

  emitStatuses();

  const basePayload: Record<string, unknown> = {
    profile: args.profile,
    horizonMonths: args.horizonMonths,
    assumptions: args.assumptions,
    policyId: args.policyId,
    ...(args.snapshotId ? { snapshotId: args.snapshotId } : {}),
  };

  const requestStep = async (
    stepId: StepId,
    url: string,
    payload: Record<string, unknown>,
    fallbackErrorMessage: string,
  ): Promise<{ data: Record<string, unknown>; meta?: Record<string, unknown> }> => {
    updateStatus(stepId, "RUNNING");
    let res: Response;
    try {
      res = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(decoratePayload(payload)),
      });
    } catch {
      const message = `${fallbackErrorMessage} (네트워크 오류)`;
      updateStatus(stepId, "FAILED", message);
      throw new RunPipelineFatalError(stepId, message);
    }

    const responsePayload = await parseApiResponse<Record<string, unknown>>(res);
    const code = normalizeErrorCode(responsePayload?.error?.code);
    if (!res.ok || !responsePayload?.ok) {
      const reason = toMessage(args.resolveErrorMessage, responsePayload?.error, fallbackErrorMessage);
      updateStatus(stepId, "FAILED", reason);
      throw new RunPipelineFatalError(stepId, reason, code);
    }

    updateStatus(stepId, "SUCCESS");
    return {
      data: asRecord(responsePayload.data),
      meta: asRecord(responsePayload.meta),
    };
  };

  const runOptionalStep = async (
    stepId: Exclude<StepId, "simulate">,
    url: string,
    payload: Record<string, unknown>,
    failMessage: string,
  ): Promise<Record<string, unknown> | undefined> => {
    updateStatus(stepId, "RUNNING");
    let res: Response;
    try {
      res = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(decoratePayload(payload)),
      });
    } catch {
      updateStatus(stepId, "FAILED", `${failMessage} (네트워크 오류)`);
      return undefined;
    }

    const responsePayload = await parseApiResponse<Record<string, unknown>>(res);
    const code = normalizeErrorCode(responsePayload?.error?.code);

    if (code === "SNAPSHOT_NOT_FOUND") {
      const reason = toMessage(args.resolveErrorMessage, responsePayload?.error, failMessage);
      updateStatus(stepId, "FAILED", reason);
      throw new RunPipelineFatalError(stepId, reason, code);
    }

    if (!res.ok || !responsePayload?.ok) {
      if (stepId === "monteCarlo" && code === "BUDGET_EXCEEDED") {
        updateStatus(stepId, "SKIPPED", "예산 초과로 생략됨");
        return undefined;
      }
      const reason = toMessage(args.resolveErrorMessage, responsePayload?.error, failMessage);
      updateStatus(stepId, "FAILED", reason);
      return undefined;
    }

    updateStatus(stepId, "SUCCESS");
    return asRecord(responsePayload.data);
  };

  const simulateResult = await requestStep(
    "simulate",
    "/api/planning/v2/simulate",
    basePayload,
    "시뮬레이션 실행에 실패했습니다.",
  );
  result.simulate = simulateResult.data;
  result.meta = simulateResult.meta;

  const criticalCount = Number(asRecord(simulateResult.meta?.health).criticalCount ?? 0);
  const runHeavyBlocked = criticalCount > 0 && !args.healthAck;

  if (!args.toggles.scenarios) {
    updateStatus("scenarios", "SKIPPED", "옵션 비활성");
  } else {
    result.scenarios = await runOptionalStep(
      "scenarios",
      "/api/planning/v2/scenarios",
      basePayload,
      "시나리오 계산에 실패했습니다.",
    );
  }

  if (!args.toggles.monteCarlo) {
    updateStatus("monteCarlo", "SKIPPED", "옵션 비활성");
  } else if (!args.flags.monteCarloEnabled) {
    updateStatus("monteCarlo", "SKIPPED", "서버 비활성");
  } else if (runHeavyBlocked) {
    updateStatus("monteCarlo", "SKIPPED", "치명 경고 확인 전 생략");
  } else {
    result.monteCarlo = await runOptionalStep(
      "monteCarlo",
      "/api/planning/v2/monte-carlo",
      {
        ...basePayload,
        monteCarlo: args.monteCarlo,
      },
      "몬테카를로 계산에 실패했습니다.",
    );
  }

  if (!args.toggles.actions) {
    updateStatus("actions", "SKIPPED", "옵션 비활성");
  } else if (runHeavyBlocked) {
    updateStatus("actions", "SKIPPED", "치명 경고 확인 전 생략");
  } else if (args.actions.includeProducts && !args.flags.includeProductsEnabled) {
    updateStatus("actions", "SKIPPED", "서버 비활성");
  } else {
    result.actions = await runOptionalStep(
      "actions",
      "/api/planning/v2/actions",
      {
        ...basePayload,
        includeProducts: args.actions.includeProducts,
        maxCandidatesPerAction: args.actions.maxCandidatesPerAction,
      },
      "실행 계획 생성에 실패했습니다.",
    );
  }

  if (!args.toggles.debt) {
    updateStatus("debtStrategy", "SKIPPED", "옵션 비활성");
  } else {
    result.debtStrategy = await runOptionalStep(
      "debtStrategy",
      "/api/planning/v2/debt-strategy",
      {
        profile: args.profile,
        offers: args.debt.offers,
        options: args.debt.options,
      },
      "부채 분석에 실패했습니다.",
    );
  }

  return {
    ...result,
    stepStatuses: cloneStatuses(stepStatuses),
  };
}
