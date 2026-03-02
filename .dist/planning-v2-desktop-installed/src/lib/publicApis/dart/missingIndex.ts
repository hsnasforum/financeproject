import { explainAutoBuildFromUi } from "@/lib/publicApis/dart/indexBuildGuard";
import { type CorpIndexStatus } from "@/lib/publicApis/dart/corpIndex";

export const DART_CORPINDEX_BUILD_ENDPOINT = "/api/public/disclosure/corpcodes/build";
export const DART_CORPINDEX_STATUS_ENDPOINT = "/api/public/disclosure/corpcodes/status";

export type MissingCorpIndexPayload = {
  error: "CORPCODES_INDEX_MISSING";
  message: string;
  hintCommand: string;
  hintCommandWithPath: string;
  primaryPath: string;
  triedPaths: string[];
  canAutoBuild: boolean;
  autoBuildDisabledReason?: string;
  buildEndpoint: string;
  statusEndpoint: string;
};

export function buildMissingCorpIndexPayload(status: CorpIndexStatus): MissingCorpIndexPayload {
  const autoBuild = explainAutoBuildFromUi();
  return {
    error: "CORPCODES_INDEX_MISSING",
    message: "corpCodes 인덱스가 없습니다. scripts/dart_corpcode_build.py를 실행하세요.",
    hintCommand: "python3 scripts/dart_corpcode_build.py",
    hintCommandWithPath: "DART_CORPCODES_INDEX_PATH=tmp/dart/corpCodes.index.json python3 scripts/dart_corpcode_build.py",
    primaryPath: status.primaryPath,
    triedPaths: status.triedPaths,
    canAutoBuild: autoBuild.canAutoBuild,
    autoBuildDisabledReason: autoBuild.reason,
    buildEndpoint: DART_CORPINDEX_BUILD_ENDPOINT,
    statusEndpoint: DART_CORPINDEX_STATUS_ENDPOINT,
  };
}
