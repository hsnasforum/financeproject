import fs from "node:fs";
import path from "node:path";

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
  return explainAutoBuildFromUi(nodeEnv).canAutoBuild;
}

export function explainAutoBuildFromUi(nodeEnv = process.env.NODE_ENV ?? "development"): { canAutoBuild: boolean; reason?: string } {
  const env = nodeEnv.trim().toLowerCase();
  if (env === "production") {
    return { canAutoBuild: false, reason: "운영 환경에서는 비활성화" };
  }

  const isBuildStub = (process.env.DART_E2E_BUILD_STUB ?? "").trim() === "1";
  if (isBuildStub) {
    return { canAutoBuild: true };
  }

  const apiKey = (process.env.OPENDART_API_KEY ?? "").trim();
  if (!apiKey) {
    return { canAutoBuild: false, reason: "OPENDART_API_KEY가 없습니다." };
  }

  const scriptPath = path.join(process.cwd(), "scripts", "dart_corpcode_build.py");
  if (!fs.existsSync(scriptPath)) {
    return { canAutoBuild: false, reason: "dart_corpcode_build.py가 없습니다." };
  }

  return {
    canAutoBuild: true,
  };
}
