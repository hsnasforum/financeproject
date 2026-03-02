import { formatSnapshotLabel } from "../../../../planning/_lib/formatSnapshotLabel";
import { loadSnapshotListForPlanning, type SnapshotListItem } from "../../../../planning/_lib/snapshotList";
import {
  assertLocalHost,
  toGuardErrorResponse,
} from "../../../../../lib/dev/devGuards";
import { onlyDev } from "../../../../../lib/dev/onlyDev";
import { jsonError, jsonOk } from "../../../../../lib/planning/api/response";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeLimit(value: string): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(100, parsed));
}

function toSafeStaleDays(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.trunc(value));
}

function withLocalReadGuard(request: Request) {
  try {
    assertLocalHost(request);
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) return jsonError("INTERNAL", "요청 검증 중 오류가 발생했습니다.");
    return jsonError(guard.code, guard.message, { status: guard.status });
  }
}

function toResponseItem(item: SnapshotListItem) {
  const staleDays = toSafeStaleDays(item.staleDays);
  const createdAt = asString(item.fetchedAt);
  return {
    id: item.id,
    ...(createdAt ? { createdAt } : {}),
    ...(item.asOf ? { asOf: item.asOf } : {}),
    ...(item.fetchedAt ? { fetchedAt: item.fetchedAt } : {}),
    ...(typeof staleDays === "number" ? { staleDays } : {}),
    ...(typeof item.warningsCount === "number" ? { warningsCount: item.warningsCount } : {}),
    ...(item.korea ? { korea: item.korea } : {}),
    label: formatSnapshotLabel(item, "history"),
  };
}

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guardFailure = withLocalReadGuard(request);
  if (guardFailure) return guardFailure;

  const { searchParams } = new URL(request.url);
  const limit = toSafeLimit(asString(searchParams.get("limit")));

  try {
    const snapshots = await loadSnapshotListForPlanning(limit);
    const latest = snapshots.latest;
    const items = [...snapshots.history].sort((a, b) => {
      const aTs = Date.parse(asString(a.fetchedAt));
      const bTs = Date.parse(asString(b.fetchedAt));
      if (Number.isFinite(aTs) && Number.isFinite(bTs) && bTs !== aTs) return bTs - aTs;
      return b.id.localeCompare(a.id);
    });
    return jsonOk({
      latestId: latest?.id ?? null,
      latestLabel: latest ? formatSnapshotLabel(latest, "latest") : "LATEST · unavailable",
      items: items.map((item) => toResponseItem(item)),
    });
  } catch (error) {
    return jsonError(
      "INTERNAL",
      error instanceof Error ? error.message : "스냅샷 목록 조회에 실패했습니다.",
      { status: 500 },
    );
  }
}
