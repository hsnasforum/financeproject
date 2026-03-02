import { matchCandidates } from "../v2/actions/matchFinlifeCandidates";
import { type ActionItemV2, type ProductCandidate } from "../v2/actions/types";

export type MatchEmergencyCandidatesArgs = {
  emergencyHorizonMonths?: number;
  maxCandidatesPerAction?: number;
  requestBaseUrl?: string;
  fetchImpl?: typeof fetch;
};

export type MatchGoalCandidatesArgs = {
  targetMonth?: number;
  maxCandidatesPerAction?: number;
  requestBaseUrl?: string;
  fetchImpl?: typeof fetch;
};

export type ProductCandidatesProvider = {
  matchEmergencyCandidates(args: MatchEmergencyCandidatesArgs): Promise<ProductCandidate[]>;
  matchGoalCandidates(args: MatchGoalCandidatesArgs): Promise<ProductCandidate[]>;
};

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning product candidates provider is server-only.");
  }
}

function buildSeedAction(code: ActionItemV2["code"], metrics?: Record<string, number>): ActionItemV2 {
  return {
    code,
    severity: "info",
    title: code,
    summary: code,
    why: [],
    metrics: metrics ?? {},
    steps: [],
    cautions: [],
  };
}

export function createFinlifeProductCandidatesProvider(): ProductCandidatesProvider {
  return {
    async matchEmergencyCandidates(args) {
      assertServerOnly();
      const [action] = await matchCandidates(
        [buildSeedAction("BUILD_EMERGENCY_FUND")],
        {
          includeProducts: true,
          emergencyHorizonMonths: args.emergencyHorizonMonths,
          maxCandidatesPerAction: args.maxCandidatesPerAction,
          requestBaseUrl: args.requestBaseUrl,
          fetchImpl: args.fetchImpl,
        },
      );
      return action?.candidates ?? [];
    },

    async matchGoalCandidates(args) {
      assertServerOnly();
      const targetMonth = Math.max(1, Math.trunc(args.targetMonth ?? 12));
      const [action] = await matchCandidates(
        [buildSeedAction("COVER_LUMP_SUM_GOAL", { targetMonth })],
        {
          includeProducts: true,
          maxCandidatesPerAction: args.maxCandidatesPerAction,
          requestBaseUrl: args.requestBaseUrl,
          fetchImpl: args.fetchImpl,
        },
      );
      return action?.candidates ?? [];
    },
  };
}

export async function attachProductCandidatesToActions(
  provider: ProductCandidatesProvider,
  actions: ActionItemV2[],
  options: {
    includeProducts: boolean;
    emergencyHorizonMonths?: number;
    maxCandidatesPerAction?: number;
    requestBaseUrl?: string;
    fetchImpl?: typeof fetch;
  },
): Promise<ActionItemV2[]> {
  if (!options.includeProducts) return actions;
  assertServerOnly();

  let emergencyCandidates: ProductCandidate[] | null = null;
  const goalCandidatesByMonth = new Map<number, ProductCandidate[]>();

  const out: ActionItemV2[] = [];
  for (const action of actions) {
    if (action.code === "BUILD_EMERGENCY_FUND") {
      if (!emergencyCandidates) {
        emergencyCandidates = await provider.matchEmergencyCandidates({
          emergencyHorizonMonths: options.emergencyHorizonMonths,
          maxCandidatesPerAction: options.maxCandidatesPerAction,
          requestBaseUrl: options.requestBaseUrl,
          fetchImpl: options.fetchImpl,
        });
      }
      out.push({
        ...action,
        ...(emergencyCandidates.length > 0 ? { candidates: emergencyCandidates } : {}),
      });
      continue;
    }

    if (action.code === "COVER_LUMP_SUM_GOAL" || action.code === "IMPROVE_RETIREMENT_PLAN") {
      const targetMonth = Math.max(1, Math.trunc(action.metrics.targetMonth ?? 12));
      if (!goalCandidatesByMonth.has(targetMonth)) {
        goalCandidatesByMonth.set(
          targetMonth,
          await provider.matchGoalCandidates({
            targetMonth,
            maxCandidatesPerAction: options.maxCandidatesPerAction,
            requestBaseUrl: options.requestBaseUrl,
            fetchImpl: options.fetchImpl,
          }),
        );
      }
      const candidates = goalCandidatesByMonth.get(targetMonth) ?? [];
      out.push({
        ...action,
        ...(candidates.length > 0 ? { candidates } : {}),
      });
      continue;
    }

    out.push(action);
  }

  return out;
}
