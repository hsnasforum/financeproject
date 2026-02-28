import { NextResponse } from "next/server";
import { append as appendAuditLog } from "../../../../../../lib/audit/auditLogStore";
import {
  assertCsrf,
  assertDevUnlocked,
  assertLocalHost,
  assertSameOrigin,
  toGuardErrorResponse,
} from "../../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../../lib/dev/onlyDev";
import {
  findAssumptionsSnapshotId,
  loadAssumptionsSnapshotById,
  loadLatestAssumptionsSnapshot,
  setLatestSnapshotFromHistory,
} from "../../../../../../lib/planning/assumptions/storage";

type SetLatestBody = {
  csrf?: unknown;
  snapshotId?: unknown;
  confirm?: unknown;
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function appendSetLatestAudit(input: {
  result: "SUCCESS" | "REJECTED" | "ERROR";
  message: string;
  fromId?: string | null;
  toId?: string | null;
}) {
  try {
    appendAuditLog({
      event: "ASSUMPTIONS_SET_LATEST",
      route: "/api/ops/assumptions/set-latest",
      summary: `ASSUMPTIONS_SET_LATEST ${input.result}: ${input.message}`,
      details: {
        result: input.result,
        message: input.message,
        fromId: input.fromId ?? null,
        toId: input.toId ?? null,
      },
    });
  } catch (error) {
    console.error("[audit] failed to append assumptions set latest log", error);
  }
}

export async function POST(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  let body: SetLatestBody = null;
  try {
    body = (await request.json()) as SetLatestBody;
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
      return NextResponse.json({ ok: false, message: "요청 검증 중 오류가 발생했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: false, message: guard.message }, { status: guard.status });
  }

  const snapshotId = asString(body?.snapshotId);
  if (!snapshotId) {
    return NextResponse.json({ ok: false, message: "snapshotId가 필요합니다." }, { status: 400 });
  }

  const currentLatest = await loadLatestAssumptionsSnapshot().catch(() => null);
  const fromId = currentLatest ? await findAssumptionsSnapshotId(currentLatest) : undefined;

  const expectedConfirm = `SET_LATEST ${snapshotId}`;
  const confirm = asString(body?.confirm);
  if (confirm !== expectedConfirm) {
    appendSetLatestAudit({
      result: "REJECTED",
      fromId: fromId ?? null,
      toId: snapshotId,
      message: "invalid confirm text",
    });
    return NextResponse.json(
      {
        ok: false,
        message: `confirm 값이 올바르지 않습니다. (${expectedConfirm})`,
      },
      { status: 400 },
    );
  }

  const target = await loadAssumptionsSnapshotById(snapshotId);
  if (!target) {
    appendSetLatestAudit({
      result: "ERROR",
      fromId: fromId ?? null,
      toId: snapshotId,
      message: "snapshot not found",
    });
    return NextResponse.json(
      {
        ok: false,
        message: "요청한 스냅샷을 찾을 수 없습니다.",
      },
      { status: 404 },
    );
  }

  try {
    await setLatestSnapshotFromHistory(snapshotId);
    appendSetLatestAudit({
      result: "SUCCESS",
      fromId: fromId ?? null,
      toId: snapshotId,
      message: "latest snapshot pointer updated",
    });

    return NextResponse.json({
      ok: true,
      message: "latest 스냅샷 포인터를 변경했습니다.",
      snapshotRef: {
        id: snapshotId,
        asOf: target.asOf,
        fetchedAt: target.fetchedAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "latest 변경에 실패했습니다.";
    appendSetLatestAudit({
      result: "ERROR",
      fromId: fromId ?? null,
      toId: snapshotId,
      message,
    });
    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 },
    );
  }
}
