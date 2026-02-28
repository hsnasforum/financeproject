import { afterEach, describe, expect, it } from "vitest";
import { requireGithubEnv } from "../src/lib/github/env";

const env = process.env as Record<string, string | undefined>;
const originalValues = {
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  GITHUB_OWNER: process.env.GITHUB_OWNER,
  GITHUB_REPO: process.env.GITHUB_REPO,
  AUTO_MERGE_REQUIRED_CHECKS: process.env.AUTO_MERGE_REQUIRED_CHECKS,
  AUTO_MERGE_CONFIRM_TEMPLATE: process.env.AUTO_MERGE_CONFIRM_TEMPLATE,
  AUTO_MERGE_ENABLED: process.env.AUTO_MERGE_ENABLED,
  AUTO_MERGE_REQUIRED_LABEL: process.env.AUTO_MERGE_REQUIRED_LABEL,
  AUTO_MERGE_MIN_APPROVALS: process.env.AUTO_MERGE_MIN_APPROVALS,
  AUTO_MERGE_REQUIRE_CLEAN: process.env.AUTO_MERGE_REQUIRE_CLEAN,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalValues)) {
    if (typeof value === "string") env[key] = value;
    else delete env[key];
  }
});

describe("requireGithubEnv", () => {
  it("throws a readable error when required env vars are missing", () => {
    delete env.GITHUB_TOKEN;
    delete env.GITHUB_OWNER;
    delete env.GITHUB_REPO;

    expect(() => requireGithubEnv()).toThrowError(/GitHub 환경변수 누락/);
    expect(() => requireGithubEnv()).toThrowError(/GITHUB_TOKEN/);
    expect(() => requireGithubEnv()).toThrowError(/GITHUB_OWNER/);
    expect(() => requireGithubEnv()).toThrowError(/GITHUB_REPO/);
  });

  it("returns normalized github config when env vars are set", () => {
    env.GITHUB_TOKEN = "token";
    env.GITHUB_OWNER = "owner";
    env.GITHUB_REPO = "repo";
    env.AUTO_MERGE_REQUIRED_CHECKS = "CI, lint, ci";
    env.AUTO_MERGE_CONFIRM_TEMPLATE = "MERGE {PR} {SHA7}";
    env.AUTO_MERGE_ENABLED = "true";
    env.AUTO_MERGE_REQUIRED_LABEL = "automerge";
    env.AUTO_MERGE_MIN_APPROVALS = "2";
    env.AUTO_MERGE_REQUIRE_CLEAN = "true";

    const result = requireGithubEnv();
    expect(result).toEqual({
      token: "token",
      owner: "owner",
      repo: "repo",
      requiredChecks: ["CI", "lint"],
      confirmTemplate: "MERGE {PR} {SHA7}",
      enabledFlag: true,
      requiredLabel: "automerge",
      minApprovals: 2,
      requireClean: true,
    });
  });
});
