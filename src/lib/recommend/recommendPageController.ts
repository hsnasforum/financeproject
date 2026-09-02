import {
  defaults as recommendProfileDefaults,
  fromSearchParams as recommendProfileFromSearchParams,
  parseRecommendProfile,
  type RecommendProfileNormalized,
} from "@/lib/schemas/recommendProfile";
import type { Issue } from "@/lib/schemas/issueTypes";
import type { RecommendWeightNormalization } from "@/lib/recommend/weights";

type SearchParamsReader = {
  get(name: string): string | null;
};

export const RECOMMEND_PROFILE_STORAGE_KEY = "recommend_profile_v1";

export type RecommendQueryOverrides = {
  profilePatch: Partial<RecommendProfileNormalized>;
  hasQuery: boolean;
  autoRun: boolean;
  autoSave: boolean;
  goHistory: boolean;
  source: string | null;
  issues: Issue[];
};

export type RecommendInitialProfileState = {
  profile: RecommendProfileNormalized;
  queryOverrides: RecommendQueryOverrides;
  weightNormalization: RecommendWeightNormalization | null;
};

export type RecommendAutorunContinuation =
  | {
    kind: "reuse";
    runId: string;
    historyHref: string | null;
  }
  | {
    kind: "save";
    signature: string;
    goHistory: boolean;
  };

function readBooleanFlag(searchParams: SearchParamsReader, name: string): boolean {
  const raw = (searchParams.get(name) ?? "").toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function parseRecommendQueryOverrides(
  searchParams: SearchParamsReader,
): RecommendQueryOverrides {
  const parsedPatch = recommendProfileFromSearchParams(searchParams);
  const profilePatch = parsedPatch.value;

  return {
    profilePatch,
    hasQuery: Object.keys(profilePatch).length > 0,
    autoRun: readBooleanFlag(searchParams, "autorun"),
    autoSave: readBooleanFlag(searchParams, "save"),
    goHistory: (searchParams.get("go") ?? "").toLowerCase() === "history",
    source: searchParams.get("from"),
    issues: parsedPatch.issues,
  };
}

export function buildRecommendInitialProfileState(input: {
  searchParams: SearchParamsReader;
  storedProfileRaw: string | null;
}): RecommendInitialProfileState {
  let profile = recommendProfileDefaults();
  let weightNormalization: RecommendWeightNormalization | null = null;

  try {
    if (input.storedProfileRaw) {
      const parsed = JSON.parse(input.storedProfileRaw) as unknown;
      const parsedProfile = parseRecommendProfile({
        ...profile,
        ...(typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : {}),
      });
      profile = parsedProfile.value;
      if (parsedProfile.weightNormalization.normalized) {
        weightNormalization = parsedProfile.weightNormalization;
      }
    }
  } catch {
    // Invalid browser storage falls back to the current defaults.
  }

  const queryOverrides = parseRecommendQueryOverrides(input.searchParams);
  if (queryOverrides.hasQuery) {
    profile = parseRecommendProfile({ ...profile, ...queryOverrides.profilePatch }).value;
  }

  return { profile, queryOverrides, weightNormalization };
}

export function buildRecommendHistoryHref(runId: string): string {
  return `/recommend/history?open=${encodeURIComponent(runId)}`;
}

export function resolveRecommendAutorunContinuation(input: {
  signature: string;
  previous: { sig: string; runId: string | null } | null;
  goHistory: boolean;
}): RecommendAutorunContinuation {
  if (input.previous?.sig === input.signature && input.previous.runId) {
    return {
      kind: "reuse",
      runId: input.previous.runId,
      historyHref: input.goHistory ? buildRecommendHistoryHref(input.previous.runId) : null,
    };
  }

  return {
    kind: "save",
    signature: input.signature,
    goHistory: input.goHistory,
  };
}
