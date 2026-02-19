export type IndexBuildGuardInput = {
  nodeEnv?: string;
  configuredToken?: string | null;
  requestToken?: string | null;
};

export function canBuildCorpIndex(input: IndexBuildGuardInput): { allowed: boolean; reason?: string } {
  const nodeEnv = (input.nodeEnv ?? process.env.NODE_ENV ?? "development").trim();
  const configuredToken = (input.configuredToken ?? process.env.DART_INDEX_BUILD_TOKEN ?? "").trim();
  const requestToken = (input.requestToken ?? "").trim();

  if (nodeEnv !== "production") {
    return { allowed: true };
  }

  if (!configuredToken) {
    return { allowed: false, reason: "INDEX_BUILD_FORBIDDEN" };
  }

  if (configuredToken !== requestToken) {
    return { allowed: false, reason: "INDEX_BUILD_FORBIDDEN" };
  }

  return { allowed: true };
}

export function canAutoBuildFromUi(nodeEnv = process.env.NODE_ENV ?? "development"): boolean {
  return nodeEnv.trim() !== "production";
}

export function explainAutoBuildFromUi(nodeEnv = process.env.NODE_ENV ?? "development"): { canAutoBuild: boolean; reason?: string } {
  if (canAutoBuildFromUi(nodeEnv)) {
    return { canAutoBuild: true };
  }
  return {
    canAutoBuild: false,
    reason: "production 환경에서는 x-build-token 헤더가 필요한 보호 정책으로 UI 자동 생성이 비활성화됩니다.",
  };
}
