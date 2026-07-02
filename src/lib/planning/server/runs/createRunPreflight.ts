import { preflightRun } from "../../v2/preflight";
import { type ProfileV2 } from "../v2/types";
import { type CreatePlanningRunCommand } from "./createRunCommandParser";

type PreflightIssue = ReturnType<typeof preflightRun>[number];

export type CreatePlanningRunPreflightResult =
  | { ok: true; issues: PreflightIssue[] }
  | {
    ok: false;
    issues: PreflightIssue[];
    blockIssues: PreflightIssue[];
    responseIssues: string[];
    meta: {
      preflight: {
        blocks: PreflightIssue[];
      };
    };
  };

function formatPreflightIssueLine(issue: {
  code: string;
  message: string;
  fixHint?: string;
}): string {
  if (issue.fixHint && issue.fixHint.trim().length > 0) {
    return `${issue.code}: ${issue.message} (${issue.fixHint})`;
  }
  return `${issue.code}: ${issue.message}`;
}

export function evaluateCreatePlanningRunPreflight(input: {
  profile: ProfileV2;
  requestedSnapshotId?: string;
  debtStrategyInput: CreatePlanningRunCommand["debtStrategyInput"];
  assumptionsOverride: CreatePlanningRunCommand["assumptionsOverride"];
  monteCarloConfig?: CreatePlanningRunCommand["monteCarloConfig"];
  horizonMonths: number;
}): CreatePlanningRunPreflightResult {
  const issues = preflightRun({
    profile: input.profile as unknown as Record<string, unknown>,
    selectedSnapshot: input.requestedSnapshotId
      ? { mode: "history", id: input.requestedSnapshotId }
      : { mode: "latest" },
    debtOffers: input.debtStrategyInput.offers.map((offer) => ({
      liabilityId: offer.liabilityId,
      newAprPct: offer.newAprPct,
      ...(typeof offer.feeKrw === "number" ? { feeKrw: offer.feeKrw } : {}),
    })),
    assumptionsOverride: input.assumptionsOverride,
    ...(input.monteCarloConfig
      ? {
        monteCarlo: {
          enabled: true,
          paths: input.monteCarloConfig.paths,
          horizonMonths: input.horizonMonths,
        },
      }
      : {}),
  });
  const blockIssues = issues.filter((issue) => issue.severity === "block");
  if (blockIssues.length < 1) {
    return {
      ok: true,
      issues,
    };
  }
  return {
    ok: false,
    issues,
    blockIssues,
    responseIssues: blockIssues.map((issue) => formatPreflightIssueLine(issue)),
    meta: {
      preflight: {
        blocks: blockIssues,
      },
    },
  };
}
