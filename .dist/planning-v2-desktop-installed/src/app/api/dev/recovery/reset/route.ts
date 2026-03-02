import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { append as appendAuditLog } from "../../../../../lib/audit/auditLogStore";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";

type ResetTarget = "feedback" | "dart" | "refresh";

type ResetBody = {
  targets?: unknown;
  confirm?: unknown;
  csrf?: unknown;
} | null;

const ALLOWED_TARGETS: ResetTarget[] = ["feedback", "dart", "refresh"];

const DART_FILES = [
  "disclosure_alerts.json",
  "disclosure_digest.json",
  "disclosure_digest.prev.json",
  "disclosure_state.json",
  "daily_brief.json",
] as const;

function resolveTmpRoot(): string {
  const envPath = (process.env.RECOVERY_TMP_DIR ?? "").trim();
  if (envPath) return path.resolve(envPath);
  return path.join(process.cwd(), "tmp");
}

function normalizeTargets(value: unknown): ResetTarget[] | null {
  if (!Array.isArray(value) || value.length < 1) return null;
  const out: ResetTarget[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    const target = entry.trim() as ResetTarget;
    if (!ALLOWED_TARGETS.includes(target)) return null;
    if (seen.has(target)) continue;
    seen.add(target);
    out.push(target);
  }
  return out.length > 0 ? out : null;
}

function removeFileIfExists(absolutePath: string): boolean {
  if (!fs.existsSync(absolutePath)) return false;
  fs.unlinkSync(absolutePath);
  return true;
}

function writeJson(absolutePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, JSON.stringify(value, null, 2), "utf-8");
}

function relTmp(relativePath: string): string {
  return `tmp/${relativePath.replaceAll("\\", "/")}`;
}

function auditRecoveryReset(summary: string, details: Record<string, unknown>): void {
  try {
    appendAuditLog({
      event: "RECOVERY_RESET",
      route: "/api/dev/recovery/reset",
      summary,
      details,
    });
  } catch (error) {
    console.error("[audit] failed to append recovery reset log", error);
  }
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: ResetBody = null;
  try {
    body = (await request.json()) as ResetBody;
  } catch {
    body = null;
  }

  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, body);
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "요청 검증 중 오류가 발생했습니다." } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: guard.code, message: guard.message } },
      { status: guard.status },
    );
  }

  if (body?.confirm !== "RESET") {
    auditRecoveryReset("리커버리 reset 실패: INVALID_CONFIRM", {
      ok: false,
      code: "INVALID_CONFIRM",
    });
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_CONFIRM", message: "confirm은 RESET 이어야 합니다." } },
      { status: 400 },
    );
  }

  const targets = normalizeTargets(body?.targets);
  if (!targets) {
    auditRecoveryReset("리커버리 reset 실패: INVALID_TARGETS", {
      ok: false,
      code: "INVALID_TARGETS",
    });
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_TARGETS", message: "targets는 feedback|dart|refresh 배열이어야 합니다." } },
      { status: 400 },
    );
  }

  const tmpRoot = resolveTmpRoot();
  const removed: string[] = [];
  const recreated: string[] = [];
  const nowIso = new Date().toISOString();

  for (const target of targets) {
    if (target === "feedback") {
      const absolute = path.join(tmpRoot, "user_feedback.json");
      if (removeFileIfExists(absolute)) removed.push(relTmp("user_feedback.json"));
      writeJson(absolute, []);
      recreated.push(relTmp("user_feedback.json"));
      continue;
    }

    if (target === "refresh") {
      const absolute = path.join(tmpRoot, "daily_refresh_result.json");
      if (removeFileIfExists(absolute)) removed.push(relTmp("daily_refresh_result.json"));
      writeJson(absolute, {
        generatedAt: nowIso,
        steps: [],
        ok: false,
      });
      recreated.push(relTmp("daily_refresh_result.json"));
      continue;
    }

    if (target === "dart") {
      for (const name of DART_FILES) {
        const absolute = path.join(tmpRoot, "dart", name);
        if (removeFileIfExists(absolute)) removed.push(relTmp(`dart/${name}`));

        if (name === "disclosure_alerts.json") {
          writeJson(absolute, {
            generatedAt: nowIso,
            newHigh: [],
            newMid: [],
            updatedHigh: [],
            updatedMid: [],
          });
        } else if (name === "daily_brief.json") {
          writeJson(absolute, {
            generatedAt: nowIso,
            lines: [],
            topNew: [],
            topUpdated: [],
            stats: {
              total: 0,
              shown: 0,
              maxLines: 10,
            },
          });
        } else if (name === "disclosure_state.json") {
          writeJson(absolute, {
            generatedAt: nowIso,
            items: [],
          });
        } else {
          writeJson(absolute, {
            generatedAt: nowIso,
            topHighlights: [],
            summary: {
              companies: 0,
              totalItems: 0,
              totalNew: 0,
              errors: 0,
            },
          });
        }
        recreated.push(relTmp(`dart/${name}`));
      }
    }
  }

  auditRecoveryReset("리커버리 reset 완료", {
    ok: true,
    targets,
    removedCount: removed.length,
    recreatedCount: recreated.length,
    removed: removed.slice(0, 20),
    recreated: recreated.slice(0, 20),
  });

  return NextResponse.json({
    ok: true,
    removed,
    recreated,
  });
}
