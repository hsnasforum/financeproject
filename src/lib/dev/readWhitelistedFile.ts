import fs from "node:fs";
import path from "node:path";

export const ARTIFACT_WHITELIST = {
  brief_md: "docs/dart-daily-brief.md",
  alerts_md: "docs/dart-disclosure-alerts.md",
  digest_md: "docs/dart-disclosure-digest.md",
  refresh_json: "tmp/daily_refresh_result.json",
  refresh_log: "tmp/daily_refresh.log",
  alerts_json: "tmp/dart/disclosure_alerts.json",
  digest_json: "tmp/dart/disclosure_digest.json",
  brief_json: "tmp/dart/daily_brief.json",
  rules_eval_md: "docs/dart-rules-eval-report.md",
  rules_quality_md: "docs/dart-rules-quality-report.md",
  rules_suggest_md: "docs/dart-rules-suggestions.md",
  rules_patch_diff_md: "docs/dart-rules-patch-diff.md",
  rules_labeled_md: "docs/dart-rules-labeled-report.md",
  rules_eval_json: "tmp/dart/rules_eval.json",
  rules_labeled_json: "tmp/dart/rules_labeled_eval.json",
  rules_suggest_json: "tmp/dart/rules_suggestions.json",
  rules_patch_json: "tmp/dart/rules_patch.json",
  rules_pr_patch: "tmp/dart/rules_pr.patch",
} as const;

export type ArtifactName = keyof typeof ARTIFACT_WHITELIST;

type ReadArtifactErrorCode = "INPUT" | "READ_FAILED";

type ReadArtifactSuccess = {
  ok: true;
  data: {
    name: ArtifactName;
    path: string;
    content: string;
    truncated: boolean;
  } | null;
};

type ReadArtifactFailure = {
  ok: false;
  error: {
    code: ReadArtifactErrorCode;
    message: string;
  };
};

export type ReadArtifactResult = ReadArtifactSuccess | ReadArtifactFailure;

function isArtifactName(name: string): name is ArtifactName {
  return Object.prototype.hasOwnProperty.call(ARTIFACT_WHITELIST, name);
}

function resolveSafePath(root: string, relativePath: string): string | null {
  const normalizedRoot = path.resolve(root);
  const absolute = path.resolve(normalizedRoot, relativePath);
  if (absolute === normalizedRoot || absolute.startsWith(`${normalizedRoot}${path.sep}`)) {
    return absolute;
  }
  return null;
}

export function readArtifact(name: string, options?: { maxBytes?: number }): ReadArtifactResult {
  const trimmed = String(name ?? "").trim();
  if (!trimmed || !isArtifactName(trimmed)) {
    return {
      ok: false,
      error: {
        code: "INPUT",
        message: "name은 허용된 산출물 키여야 합니다.",
      },
    };
  }

  const cwd = process.cwd();
  const relativePath = ARTIFACT_WHITELIST[trimmed];
  const absolutePath = resolveSafePath(cwd, relativePath);
  if (!absolutePath) {
    return {
      ok: false,
      error: {
        code: "READ_FAILED",
        message: "산출물 경로를 해석할 수 없습니다.",
      },
    };
  }

  if (!fs.existsSync(absolutePath)) {
    return { ok: true, data: null };
  }

  const maxBytes = Math.max(1, Math.min(5 * 1024 * 1024, Math.trunc(options?.maxBytes ?? 524_288)));
  try {
    const raw = fs.readFileSync(absolutePath);
    const truncated = raw.byteLength > maxBytes;
    const content = (truncated ? raw.subarray(0, maxBytes) : raw).toString("utf-8");

    return {
      ok: true,
      data: {
        name: trimmed,
        path: relativePath,
        content,
        truncated,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "READ_FAILED",
        message: error instanceof Error ? error.message : "산출물 파일 읽기에 실패했습니다.",
      },
    };
  }
}
