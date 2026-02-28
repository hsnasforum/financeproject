import { NextResponse } from "next/server";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { append as appendAuditLog } from "../../../../../lib/audit/auditLogStore";
import { defaultPolicy, loadPolicy, savePolicy, validatePolicy, type RetentionPolicy } from "../../../../../lib/maintenance/retentionPolicy";

type RetentionBody = {
  csrf?: unknown;
  policy?: unknown;
  version?: unknown;
  feedbackMaxItems?: unknown;
  fixHistoryMaxItems?: unknown;
  refreshLogMaxBytes?: unknown;
  refreshLogKeepTailBytes?: unknown;
  keepBackupRestorePoint?: unknown;
} | null;

function extractPolicyCandidate(body: RetentionBody): unknown {
  if (body && typeof body.policy === "object" && body.policy !== null && !Array.isArray(body.policy)) {
    return body.policy;
  }
  if (!body || typeof body !== "object") return {};
  return {
    version: body.version,
    feedbackMaxItems: body.feedbackMaxItems,
    fixHistoryMaxItems: body.fixHistoryMaxItems,
    refreshLogMaxBytes: body.refreshLogMaxBytes,
    refreshLogKeepTailBytes: body.refreshLogKeepTailBytes,
    keepBackupRestorePoint: body.keepBackupRestorePoint,
  };
}

function summarizeRetentionDiff(before: RetentionPolicy, after: RetentionPolicy): string {
  const keys: Array<keyof RetentionPolicy> = [
    "version",
    "feedbackMaxItems",
    "fixHistoryMaxItems",
    "refreshLogMaxBytes",
    "refreshLogKeepTailBytes",
    "keepBackupRestorePoint",
  ];
  const changes: string[] = [];
  for (const key of keys) {
    if (before[key] === after[key]) continue;
    changes.push(`${key}:${String(before[key])}->${String(after[key])}`);
  }
  if (changes.length < 1) return "리텐션 정책 저장 (변경 없음)";
  return `리텐션 정책 변경 ${changes.join(", ")}`;
}

export async function GET() {
  const blocked = onlyDev();
  if (blocked) return blocked;

  try {
    const policy = loadPolicy();
    return NextResponse.json({
      ok: true,
      data: policy,
    });
  } catch (error) {
    console.error("[dev/maintenance/retention] failed to load policy", error);
    return NextResponse.json({
      ok: true,
      data: defaultPolicy(),
      meta: {
        degraded: true,
        reasonCode: "RETENTION_POLICY_READ_FAILED",
      },
    });
  }
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: RetentionBody = null;
  try {
    body = (await request.json()) as RetentionBody;
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
        {
          ok: false,
          error: { code: "INTERNAL", message: "요청 검증 중 오류가 발생했습니다." },
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: { code: guard.code, message: guard.message },
      },
      { status: guard.status },
    );
  }

  const candidate = extractPolicyCandidate(body);
  const validated = validatePolicy(candidate);
  if (!validated.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INVALID_POLICY",
          message: validated.errors[0] ?? "정책 값이 올바르지 않습니다.",
        },
        errors: validated.errors,
      },
      { status: 400 },
    );
  }

  const beforePolicy = loadPolicy();

  try {
    savePolicy(validated.data);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SAVE_FAILED",
          message: error instanceof Error ? error.message : "정책 저장에 실패했습니다.",
        },
      },
      { status: 500 },
    );
  }

  try {
    appendAuditLog({
      event: "RETENTION_UPDATE",
      route: "/api/dev/maintenance/retention",
      summary: summarizeRetentionDiff(beforePolicy, validated.data),
      details: {
        before: beforePolicy,
        after: validated.data,
      },
    });
  } catch (auditError) {
    console.error("[audit] failed to append retention update log", auditError);
  }

  return NextResponse.json({
    ok: true,
    data: validated.data,
  });
}
