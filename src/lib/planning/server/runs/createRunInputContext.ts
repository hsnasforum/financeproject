import { PlanningRunAssumptionsResolveError, resolvePlanningRunAssumptions } from "../v2/runAssumptionsRouteService";
import { PlanningV2ValidationError, type ProfileV2 } from "../v2/types";
import { loadCanonicalProfile, type CanonicalProfileLoadResult } from "../../v2/loadCanonicalProfile";
import { applyProfilePatch } from "../../v2/profilePatch";
import { computeAssumptionsHash } from "../../v2/reproducibility";
import { stableStringify } from "../../cache/key";
import {
  applyScenario,
  validateScenario,
} from "../../v2/scenario";
import {
  legacyScenarioToInputScenario,
  parseRiskTolerance,
  parseCreatePlanningRunCommand,
  validationIssues,
  type CreatePlanningRunCommand,
  type RunInputScenario,
} from "./createRunCommandParser";
import { evaluateCreatePlanningRunPreflight } from "./createRunPreflight";
import { type CurrentUserRunRecord } from "./routeService";
import { type CurrentUserPlanningProfileRecord } from "../profiles/repository";

type CreateRunInputContextAudit = {
  result: "ERROR";
  recordId?: string | null;
  message: string;
};

type CreateRunInputContextError = {
  code: string;
  message: string;
  status?: number;
  issues?: string[];
  meta?: Record<string, unknown>;
};

export type CreateRunInputContextDependencies = {
  getProfile: (profileId: string) => Promise<CurrentUserPlanningProfileRecord | null>;
  getRun: (runId: string) => Promise<CurrentUserRunRecord | null>;
  resolveAssumptions: typeof resolvePlanningRunAssumptions;
};

export type CreateRunAssumptionsContext = Awaited<ReturnType<typeof resolvePlanningRunAssumptions>>;

export type CreatePlanningRunInputContextResult =
  | {
    ok: true;
    profileRecord: CurrentUserPlanningProfileRecord;
    canonicalProfile: ProfileV2;
    profileNormalization: CanonicalProfileLoadResult["normalization"];
    scenarioInput?: RunInputScenario;
    riskTolerance: ReturnType<typeof parseRiskTolerance>;
    assumptionsContext: CreateRunAssumptionsContext;
  }
  | {
    ok: false;
    audit: CreateRunInputContextAudit;
    error: CreateRunInputContextError;
  };

function inputContextError(input: {
  audit: CreateRunInputContextAudit;
  error: CreateRunInputContextError;
}): CreatePlanningRunInputContextResult {
  return {
    ok: false,
    audit: input.audit,
    error: input.error,
  };
}

function validationIssueLines(error: PlanningV2ValidationError): string[] {
  return validationIssues(error);
}

function applyCreateRunScenario(input: {
  profile: ProfileV2;
  scenarioInput?: RunInputScenario;
  scenarioMeta?: CreatePlanningRunCommand["scenarioMeta"];
}):
  | { profile: ProfileV2 }
  | {
    error: CreateRunInputContextError;
    auditMessage: "scenario apply failed" | "scenario validation failed";
  } {
  if (input.scenarioInput) {
    try {
      return {
        profile: applyProfilePatch(input.profile, input.scenarioInput.patch),
      };
    } catch (error) {
      if (error instanceof PlanningV2ValidationError) {
        return {
          auditMessage: "scenario apply failed",
          error: {
            code: "INPUT",
            message: "scenario patch 검증에 실패했습니다.",
            status: 400,
            issues: validationIssueLines(error),
          },
        };
      }
      return {
        auditMessage: "scenario apply failed",
        error: {
          code: "INPUT",
          message: error instanceof Error ? error.message : "scenario 적용에 실패했습니다.",
          status: 400,
        },
      };
    }
  }

  if (input.scenarioMeta) {
    const scenarioIssues = validateScenario(input.profile, input.scenarioMeta.patches);
    if (scenarioIssues.length > 0) {
      return {
        auditMessage: "scenario validation failed",
        error: {
          code: "INPUT",
          message: "scenario patch 검증에 실패했습니다.",
          status: 400,
          issues: scenarioIssues.map((issue) => `${issue.path}: ${issue.message}`),
        },
      };
    }
    try {
      return {
        profile: applyScenario(input.profile, input.scenarioMeta.patches),
      };
    } catch (error) {
      return {
        auditMessage: "scenario apply failed",
        error: {
          code: "INPUT",
          message: error instanceof Error ? error.message : "scenario 적용에 실패했습니다.",
          status: 400,
        },
      };
    }
  }

  return {
    profile: input.profile,
  };
}

function mapAssumptionsResolveError(error: PlanningRunAssumptionsResolveError): CreateRunInputContextError {
  if (error.kind === "SNAPSHOT_NOT_FOUND") {
    return {
      code: "SNAPSHOT_NOT_FOUND",
      message: error.message,
      status: error.status,
      issues: error.issues,
    };
  }
  if (error.kind === "SNAPSHOT") {
    return {
      code: "SNAPSHOT",
      message: error.message,
      status: error.status,
    };
  }
  return {
    code: "INTERNAL",
    message: "저장된 가정 오버라이드 로드에 실패했습니다.",
    status: error.status,
  };
}

export async function prepareCreatePlanningRunInputContext(input: {
  command: CreatePlanningRunCommand;
  dependencies: CreateRunInputContextDependencies;
}): Promise<CreatePlanningRunInputContextResult> {
  const { command, dependencies } = input;
  const {
    profileId,
    requestedSnapshotId,
    assumptionsOverride,
    debtStrategyInput,
    monteCarloConfig,
    horizonMonths,
  } = command;
  let scenarioInput = command.scenarioInput;
  const scenarioMeta = command.scenarioMeta;

  let rerunSource: CurrentUserRunRecord | null = null;
  const rerunMismatch = () => inputContextError({
    audit: { result: "ERROR", recordId: profileId, message: "rerun conditions unavailable or changed" },
    error: { code: "RERUN_CONDITIONS_CHANGED", status: 409, message: "이전 플랜의 계산 조건을 그대로 사용할 수 없습니다. 계산 조건을 검토해 주세요." },
  });
  if (command.rerunOfRunId) {
    try {
      rerunSource = await dependencies.getRun(command.rerunOfRunId);
      if (!rerunSource || rerunSource.profileId !== profileId
        || !["SUCCESS", "PARTIAL_SUCCESS"].includes(rerunSource.overallStatus ?? "")
        || !rerunSource.reproducibility?.profileHash
        || !rerunSource.input.snapshotId || rerunSource.input.snapshotId.toLowerCase() === "latest"
        || !rerunSource.reproducibility.effectiveAssumptionsHash
        || !rerunSource.reproducibility.assumptionsHash || scenarioMeta
        || (rerunSource.scenario && !rerunSource.input.scenario)) return rerunMismatch();
      const parsed = parseCreatePlanningRunCommand({ profileId, input: rerunSource.input });
      if (!parsed.ok) return rerunMismatch();
      // Compare supported settings through the existing parser, preserving omitted/default semantics.
      const settings = ({ runRequestId, title, rerunOfRunId, ...rest }: CreatePlanningRunCommand) => {
        void runRequestId; void title; void rerunOfRunId;
        return rest;
      };
      if (stableStringify(settings(parsed.command)) !== stableStringify(settings(command))) return rerunMismatch();
    } catch {
      return rerunMismatch();
    }
  }

  const profileRecord = await dependencies.getProfile(profileId);
  if (!profileRecord) {
    return inputContextError({
      audit: {
        result: "ERROR",
        recordId: profileId,
        message: "profile not found",
      },
      error: {
        code: "NO_DATA",
        message: "프로필을 찾을 수 없습니다.",
      },
    });
  }

  const scenarioBaselineRunId = scenarioInput?.baseRunId || scenarioMeta?.baselineRunId;
  if (scenarioBaselineRunId) {
    const baselineRun = await dependencies.getRun(scenarioBaselineRunId);
    if (!baselineRun) {
      return inputContextError({
        audit: {
          result: "ERROR",
          recordId: profileId,
          message: "scenario baseline run not found",
        },
        error: {
          code: "INPUT",
          message: "scenario baseline runId를 찾을 수 없습니다.",
          status: 400,
          issues: [`input.scenario.baseRunId: '${scenarioBaselineRunId}' not found`],
        },
      });
    }
  }

  if (!scenarioInput && scenarioMeta) {
    scenarioInput = legacyScenarioToInputScenario(scenarioMeta);
  }

  let canonicalProfile: ProfileV2;
  let profileNormalization: CanonicalProfileLoadResult["normalization"];
  try {
    const canonicalLoad = loadCanonicalProfile(profileRecord.profile, {
      offers: debtStrategyInput.offers,
    });
    canonicalProfile = canonicalLoad.profile;
    profileNormalization = canonicalLoad.normalization;
  } catch (error) {
    if (error instanceof PlanningV2ValidationError) {
      return inputContextError({
        audit: {
          result: "ERROR",
          recordId: profileId,
          message: "profile canonicalization failed",
        },
        error: {
          code: "INPUT",
          message: error.message,
          status: 400,
          issues: validationIssueLines(error),
        },
      });
    }
    return inputContextError({
      audit: {
        result: "ERROR",
        recordId: profileId,
        message: "profile canonicalization failed",
      },
      error: {
        code: "INTERNAL",
        message: "실행 저장 검증 중 오류가 발생했습니다.",
      },
    });
  }

  const scenarioProfile = applyCreateRunScenario({
    profile: canonicalProfile,
    ...(scenarioInput ? { scenarioInput } : {}),
    ...(scenarioMeta ? { scenarioMeta } : {}),
  });
  if ("error" in scenarioProfile) {
    return inputContextError({
      audit: {
        result: "ERROR",
        recordId: profileId,
        message: scenarioProfile.auditMessage,
      },
      error: scenarioProfile.error,
    });
  }
  canonicalProfile = scenarioProfile.profile;

  const preflight = evaluateCreatePlanningRunPreflight({
    profile: canonicalProfile,
    requestedSnapshotId,
    debtStrategyInput,
    assumptionsOverride,
    monteCarloConfig,
    horizonMonths,
  });
  if (!preflight.ok) {
    return inputContextError({
      audit: {
        result: "ERROR",
        recordId: profileId,
        message: `preflight blocked (${preflight.blockIssues.map((issue) => issue.code).join(", ")})`,
      },
      error: {
        code: "INPUT",
        message: "실행 저장 사전 점검에 실패했습니다.",
        status: 400,
        issues: preflight.responseIssues,
        meta: preflight.meta,
      },
    });
  }

  const riskTolerance = parseRiskTolerance(canonicalProfile as unknown);
  let assumptionsContext: CreateRunAssumptionsContext;
  try {
    assumptionsContext = await dependencies.resolveAssumptions({
      profileId: profileRecord.id,
      requestedSnapshotId,
      assumptionsOverride,
      riskTolerance,
    });
  } catch (error) {
    if (error instanceof PlanningRunAssumptionsResolveError) {
      return inputContextError({
        audit: {
          result: "ERROR",
          recordId: profileId,
          message: error.auditMessage,
        },
        error: mapAssumptionsResolveError(error),
      });
    }

    const message = error instanceof Error ? error.message : "Failed to resolve run assumptions";
    return inputContextError({
      audit: {
        result: "ERROR",
        recordId: profileId,
        message,
      },
      error: {
        code: "INTERNAL",
        message,
        status: 500,
      },
    });
  }

  // Reuse the request input unchanged; never silently pick up changed stored overrides or snapshot contents.
  // This check runs before any stage or run persistence, while idempotency replay stays ahead of it in the service.
  if (rerunSource && (computeAssumptionsHash(assumptionsContext.snapshot) !== rerunSource.reproducibility?.assumptionsHash
    || computeAssumptionsHash(assumptionsContext.baseAssumptions) !== rerunSource.reproducibility?.effectiveAssumptionsHash)) {
    return rerunMismatch();
  }

  return {
    ok: true,
    profileRecord,
    canonicalProfile,
    profileNormalization,
    ...(scenarioInput ? { scenarioInput } : {}),
    riskTolerance,
    assumptionsContext,
  };
}
