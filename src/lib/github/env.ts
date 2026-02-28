export type GithubEnv = {
  token: string;
  owner: string;
  repo: string;
  requiredChecks: string[];
  confirmTemplate: string;
  enabledFlag: boolean;
  requiredLabel: string;
  minApprovals: number;
  requireClean: boolean;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseRequiredChecks(raw: string): string[] {
  const dedup = new Set<string>();
  const result: string[] = [];

  for (const entry of raw.split(",")) {
    const name = asString(entry);
    const normalized = name.toLowerCase();
    if (!normalized || dedup.has(normalized)) continue;
    dedup.add(normalized);
    result.push(name);
  }

  return result;
}

function parseNonNegativeInt(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return fallback;
  return Math.trunc(parsed);
}

export function requireGithubEnv(env: NodeJS.ProcessEnv = process.env): GithubEnv {
  const token = asString(env.GITHUB_TOKEN) || asString(env.GITHUB_TOKEN_DISPATCH);
  const owner = asString(env.GITHUB_OWNER) || asString(env.GITHUB_REPO_OWNER);
  const repo = asString(env.GITHUB_REPO) || asString(env.GITHUB_REPO_NAME);

  const missing: string[] = [];
  if (!token) missing.push("GITHUB_TOKEN");
  if (!owner) missing.push("GITHUB_OWNER");
  if (!repo) missing.push("GITHUB_REPO");

  if (missing.length > 0) {
    throw new Error(`GitHub 환경변수 누락: ${missing.join(", ")}`);
  }

  const requiredChecksRaw = asString(env.AUTO_MERGE_REQUIRED_CHECKS) || "CI";
  const requiredChecks = parseRequiredChecks(requiredChecksRaw);
  const confirmTemplate = asString(env.AUTO_MERGE_CONFIRM_TEMPLATE) || "MERGE {PR} {SHA7}";
  const enabledFlag = asString(env.AUTO_MERGE_ENABLED).toLowerCase() === "true";
  const requiredLabel = asString(env.AUTO_MERGE_REQUIRED_LABEL) || "automerge";
  const minApprovals = parseNonNegativeInt(asString(env.AUTO_MERGE_MIN_APPROVALS), 0);
  const requireClean = asString(env.AUTO_MERGE_REQUIRE_CLEAN).toLowerCase() === "true";

  return {
    token,
    owner,
    repo,
    requiredChecks: requiredChecks.length > 0 ? requiredChecks : ["CI"],
    confirmTemplate,
    enabledFlag,
    requiredLabel,
    minApprovals,
    requireClean,
  };
}
