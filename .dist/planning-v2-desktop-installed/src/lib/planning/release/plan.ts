export type ReleasePlanInput = {
  version: string;
  baseUrl?: string;
};

export type ReleaseStepId = "complete" | "acceptance" | "release-notes" | "evidence-bundle";

export type ReleasePlanStep = {
  id: ReleaseStepId;
  command: string;
  args: string[];
  env?: Record<string, string>;
  willRun: boolean;
  note?: string;
};

export type ReleasePlan = {
  version: string;
  baseUrl?: string;
  steps: ReleasePlanStep[];
  artifacts: {
    releaseNotesPath: string;
    evidenceBundlePath: string;
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeVersion(value: string): string {
  const trimmed = asString(value);
  if (trimmed) return trimmed;
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

function normalizeBaseUrl(value?: string): string | undefined {
  const trimmed = asString(value);
  if (!trimmed) return undefined;
  return trimmed.replace(/\/+$/, "");
}

export function buildReleasePlan(input: ReleasePlanInput): ReleasePlan {
  const version = normalizeVersion(input.version);
  const baseUrl = normalizeBaseUrl(input.baseUrl);

  return {
    version,
    ...(baseUrl ? { baseUrl } : {}),
    steps: [
      {
        id: "complete",
        command: "pnpm",
        args: ["planning:v2:complete"],
        willRun: true,
      },
      {
        id: "acceptance",
        command: "pnpm",
        args: ["planning:v2:acceptance"],
        ...(baseUrl ? { env: { PLANNING_BASE_URL: baseUrl }, willRun: true } : { willRun: false, note: "base-url-not-provided" }),
      },
      {
        id: "release-notes",
        command: "pnpm",
        args: ["planning:v2:release:notes", "--", `--version=${version}`],
        willRun: true,
      },
      {
        id: "evidence-bundle",
        command: "pnpm",
        args: ["planning:v2:release:evidence", "--", `--version=${version}`],
        willRun: true,
      },
    ],
    artifacts: {
      releaseNotesPath: `docs/releases/planning-v2-${version}.md`,
      evidenceBundlePath: `.data/planning/release/planning-v2-evidence-${version}.tar.gz`,
    },
  };
}

