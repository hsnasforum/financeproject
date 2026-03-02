import { NextResponse } from "next/server";
import { append as appendAuditLog } from "../../../../../../../lib/audit/auditLogStore";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../../lib/dev/onlyDev";
import { buildConfirmString, verifyConfirm } from "../../../../../../../lib/ops/confirm";
import { createGithubIssue } from "../../../../../../../lib/ops/feedback/githubIssue";
import { buildIssueFromFeedback } from "../../../../../../../lib/ops/feedback/issueBody";
import { getFeedback, updateFeedback } from "../../../../../../../lib/ops/feedback/planningFeedbackStore";

type Params = { id: string };

type CreateIssueBody = {
  csrf?: unknown;
  confirmText?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function appendCreateIssueAudit(input: {
  id: string;
  result: "SUCCESS" | "ERROR";
  message: string;
  code?: string;
  issueNumber?: number;
  issueUrl?: string;
}) {
  try {
    appendAuditLog({
      event: "PLANNING_FEEDBACK_CREATE_ISSUE",
      route: `/api/ops/feedback/planning/${input.id}/create-issue`,
      summary: `PLANNING_FEEDBACK_CREATE_ISSUE ${input.result}: ${input.message}`,
      details: {
        id: input.id,
        result: input.result,
        ...(input.code ? { code: input.code } : {}),
        ...(typeof input.issueNumber === "number" ? { issueNumber: input.issueNumber } : {}),
        ...(input.issueUrl ? { issueUrl: input.issueUrl } : {}),
      },
    });
  } catch (error) {
    console.error("[audit] planning feedback create-issue append failed", error);
  }
}

function guardRequest(request: Request, csrf: string): NextResponse | null {
  try {
    assertLocalHost(request);
    assertSameOrigin(request);
    assertDevUnlocked(request);
    assertCsrf(request, { csrf });
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return NextResponse.json({ ok: false, code: "INTERNAL", message: "요청 검증 중 오류가 발생했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: false, code: guard.code, message: guard.message }, { status: guard.status });
  }
}

export async function POST(request: Request, context: { params: Promise<Params> }) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: CreateIssueBody = null;
  try {
    body = (await request.json()) as CreateIssueBody;
  } catch {
    body = null;
  }

  const guard = guardRequest(request, asString(body?.csrf));
  if (guard) return guard;

  const params = await context.params;
  const id = asString(params.id);
  if (!id) {
    return NextResponse.json({ ok: false, code: "INPUT", message: "id를 입력하세요." }, { status: 400 });
  }

  const expectedConfirm = buildConfirmString("CREATE_ISSUE", id);
  const confirmText = asString(body?.confirmText);
  if (!verifyConfirm(confirmText, expectedConfirm)) {
    const message = `확인 문구가 일치하지 않습니다. (${expectedConfirm})`;
    appendCreateIssueAudit({ id, result: "ERROR", code: "CONFIRM_MISMATCH", message });
    return NextResponse.json(
      {
        ok: false,
        code: "CONFIRM_MISMATCH",
        message,
        meta: { expectedConfirm },
      },
      { status: 400 },
    );
  }

  const feedback = await getFeedback(id);
  if (!feedback) {
    const message = "피드백을 찾지 못했습니다.";
    appendCreateIssueAudit({ id, result: "ERROR", code: "NO_DATA", message });
    return NextResponse.json({ ok: false, code: "NO_DATA", message }, { status: 404 });
  }

  if (feedback.triage.status === "new") {
    const message = "triage 상태가 new인 피드백은 먼저 분류 후 이슈를 생성하세요.";
    appendCreateIssueAudit({ id, result: "ERROR", code: "NOT_TRIAGED", message });
    return NextResponse.json({ ok: false, code: "NOT_TRIAGED", message }, { status: 400 });
  }

  if (feedback.link?.githubIssue?.url) {
    const message = "이미 GitHub 이슈와 연결된 피드백입니다.";
    appendCreateIssueAudit({ id, result: "ERROR", code: "ALREADY_LINKED", message });
    return NextResponse.json({ ok: false, code: "ALREADY_LINKED", message }, { status: 409 });
  }

  try {
    const issueDraft = buildIssueFromFeedback(feedback);
    const created = await createGithubIssue(issueDraft);
    const linkedAt = new Date().toISOString();
    const updated = await updateFeedback(id, {
      link: {
        githubIssue: {
          number: created.number,
          url: created.url,
          createdAt: linkedAt,
        },
      },
    });

    if (!updated) {
      const message = "피드백 링크 저장에 실패했습니다.";
      appendCreateIssueAudit({ id, result: "ERROR", code: "STORE_WRITE_FAILED", message, issueNumber: created.number, issueUrl: created.url });
      return NextResponse.json({ ok: false, code: "STORE_WRITE_FAILED", message }, { status: 500 });
    }

    appendCreateIssueAudit({
      id,
      result: "SUCCESS",
      message: "GitHub issue created",
      issueNumber: created.number,
      issueUrl: created.url,
    });

    return NextResponse.json({
      ok: true,
      data: updated,
      message: `GitHub Issue 생성 완료 #${created.number}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub 이슈 생성에 실패했습니다.";
    appendCreateIssueAudit({ id, result: "ERROR", code: "GITHUB_ISSUE_FAILED", message });
    return NextResponse.json({ ok: false, code: "GITHUB_ISSUE_FAILED", message }, { status: 502 });
  }
}
