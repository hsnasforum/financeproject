import { explainAutoBuildFromUi } from "@/lib/publicApis/dart/indexBuildGuard";
import { type CorpIndexStatus } from "@/lib/publicApis/dart/corpIndex";

export const DART_CORPINDEX_BUILD_ENDPOINT = "/api/public/disclosure/corpcodes/build";
export const DART_CORPINDEX_STATUS_ENDPOINT = "/api/public/disclosure/corpcodes/status";

export type MissingCorpIndexPayload = {
  error: "CORPCODES_INDEX_MISSING" | "CORPCODES_INDEX_INVALID";
  message: string;
  exists: boolean;
  usable: false;
  issue?: CorpIndexStatus["issue"];
  hintCommand: string;
  hintCommandWithPath: string;
  primaryPath: string;
  triedPaths: string[];
  canAutoBuild: boolean;
  autoBuildDisabledReason?: string;
  buildEndpoint: string;
  statusEndpoint: string;
};

type MissingCorpIndexPayloadOptions = {
  includeOpsHints?: boolean;
};

const DART_CORPINDEX_PUBLIC_MESSAGE = "회사 검색 기준 데이터가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.";
const DART_CORPINDEX_INVALID_PUBLIC_MESSAGE = "회사 검색 기준 데이터를 읽을 수 없습니다. 잠시 후 다시 시도해 주세요.";
const DART_CORPINDEX_HINT_COMMAND = "python3 scripts/dart_corpcode_build.py";
const DART_CORPINDEX_HINT_COMMAND_WITH_PATH = "DART_CORPCODES_INDEX_PATH=tmp/dart/corpCodes.index.json python3 scripts/dart_corpcode_build.py";

export function buildMissingCorpIndexPayload(
  status: CorpIndexStatus,
  options: MissingCorpIndexPayloadOptions = {},
): MissingCorpIndexPayload {
  const autoBuild = explainAutoBuildFromUi();
  const includeOpsHints = options.includeOpsHints === true;
  const invalid = status.exists && status.usable === false;
  return {
    error: invalid ? "CORPCODES_INDEX_INVALID" : "CORPCODES_INDEX_MISSING",
    message: invalid ? DART_CORPINDEX_INVALID_PUBLIC_MESSAGE : DART_CORPINDEX_PUBLIC_MESSAGE,
    exists: status.exists,
    usable: false,
    ...(status.issue ? { issue: status.issue } : {}),
    hintCommand: includeOpsHints ? DART_CORPINDEX_HINT_COMMAND : "",
    hintCommandWithPath: includeOpsHints ? DART_CORPINDEX_HINT_COMMAND_WITH_PATH : "",
    primaryPath: status.primaryPath,
    triedPaths: status.triedPaths,
    canAutoBuild: autoBuild.canAutoBuild,
    autoBuildDisabledReason: autoBuild.reason,
    buildEndpoint: DART_CORPINDEX_BUILD_ENDPOINT,
    statusEndpoint: DART_CORPINDEX_STATUS_ENDPOINT,
  };
}
