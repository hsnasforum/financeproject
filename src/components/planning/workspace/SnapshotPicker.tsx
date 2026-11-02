"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatPct } from "@/lib/planning/i18n/format";
import {
  formatSnapshotLabel,
  getSnapshotFreshness,
  SNAPSHOT_STALE_CAUTION_DAYS,
} from "@/lib/planning/ui/formatSnapshotLabel";
import { copySnapshotIdToClipboard } from "@/lib/planning/ui/snapshotClipboard";
import {
  buildSnapshotPickerSelectValue,
  getSnapshotDetailsToggleLabel,
  parseSnapshotPickerSelectValue,
  resolveSnapshotPickerSelectedItem,
} from "@/lib/planning/ui/snapshotPickerModel";
import { type SnapshotSelection } from "@/lib/planning/ui/snapshotSelection";
import { type SnapshotListItem } from "@/lib/planning/ui/snapshotListTypes";

type SnapshotPickerProps = {
  items: { latest?: SnapshotListItem; history: SnapshotListItem[] };
  value: SnapshotSelection;
  onChange: (next: SnapshotSelection) => void;
  advancedEnabled?: boolean;
};

export default function SnapshotPicker(props: SnapshotPickerProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [copyError, setCopyError] = useState(false);
  const selected = useMemo(() => resolveSnapshotPickerSelectedItem(props.items, props.value), [props.items, props.value]);
  const selectedStaleDays = typeof selected?.staleDays === "number" && Number.isFinite(selected.staleDays)
    ? Math.max(0, Math.trunc(selected.staleDays))
    : undefined;
  const freshness = getSnapshotFreshness(selected?.staleDays);
  const selectedWarnings = selected?.warningsCount ?? 0;
  const latestMissing = !props.items.latest;
  const staleBeyondThreshold = freshness !== "ok";
  const shouldSuggestSync = latestMissing || staleBeyondThreshold;
  const freshnessBadge = (() => {
    if (!selected) return "기준 정보 없음";
    if (typeof selectedStaleDays !== "number") return "기준일 확인 필요";
    return selectedStaleDays >= SNAPSHOT_STALE_CAUTION_DAYS ? `${selectedStaleDays}일 경과` : "최신 기준";
  })();

  const selectValue = buildSnapshotPickerSelectValue(props.value);

  async function copySnapshotId(): Promise<void> {
    const result = await copySnapshotIdToClipboard(props.value, globalThis.navigator?.clipboard);
    if (!result) return;
    setCopyError(result.error);
    setCopyMessage(result.message);
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-3" data-testid="snapshot-selector">
      <p className="text-xs font-semibold text-slate-700">스냅샷 선택</p>
      <label className="block text-xs font-semibold text-slate-600">
        계산 기준 데이터
        <select
          className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
          data-testid="planning-snapshot-select"
          value={selectValue}
          onChange={(event) => {
            const next = parseSnapshotPickerSelectValue(event.target.value);
            if (next) props.onChange(next);
          }}
        >
          <option value="latest">
            {props.items.latest
              ? formatSnapshotLabel(props.items.latest, "latest")
              : "최신 데이터 없음"}
          </option>
          {props.items.history.map((item) => (
            <option key={item.id} value={`history:${item.id}`}>
              {formatSnapshotLabel(item, "history")}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {freshnessBadge ? (
          <span className="rounded-full border border-slate-200 bg-surface-muted px-2 py-1 font-semibold text-slate-700">
            <span data-testid="snapshot-stale-badge">{freshnessBadge}</span>
          </span>
        ) : null}
        {freshness === "risk" ? (
          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 font-semibold text-rose-800">위험</span>
        ) : null}
        {freshness === "caution" ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-amber-800">주의</span>
        ) : null}
        {selectedWarnings > 0 ? (
          <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-1 font-semibold text-orange-800">
            경고 {selectedWarnings}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {props.advancedEnabled ? (
          <Button
            aria-controls="snapshot-details-panel"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((prev) => !prev)}
            size="sm"
            variant="outline"
          >
            {getSnapshotDetailsToggleLabel(detailsOpen)}
          </Button>
        ) : null}
        {props.advancedEnabled ? (
          <Button
            disabled={props.value.mode !== "history"}
            onClick={() => void copySnapshotId()}
            size="sm"
            variant="outline"
          >
            기준 데이터 ID 복사
          </Button>
        ) : null}
      </div>
      {copyMessage ? (
        <p className={`text-xs font-semibold ${copyError ? "text-rose-700" : "text-navy"}`}>{copyMessage}</p>
      ) : null}

      {props.advancedEnabled && detailsOpen ? (
        <div className="rounded-lg border border-slate-200 bg-surface-muted p-3 text-xs text-slate-700" id="snapshot-details-panel">
          <p>id: <span className="font-semibold">{selected?.id ?? "-"}</span></p>
          <p>asOf: <span className="font-semibold">{selected?.asOf ?? "-"}</span></p>
          <p>fetchedAt: <span className="font-semibold">{selected?.fetchedAt ?? "-"}</span></p>
          <p>staleDays: <span className="font-semibold">{typeof selected?.staleDays === "number" ? selected.staleDays : "-"}</span></p>
          <p>기준금리: <span className="font-semibold">{typeof selected?.korea?.policyRatePct === "number" ? formatPct("ko-KR", selected.korea.policyRatePct) : "-"}</span></p>
          <p>CPI YoY: <span className="font-semibold">{typeof selected?.korea?.cpiYoYPct === "number" ? formatPct("ko-KR", selected.korea.cpiYoYPct) : "-"}</span></p>
          <p>예금 평균: <span className="font-semibold">{typeof selected?.korea?.newDepositAvgPct === "number" ? formatPct("ko-KR", selected.korea.newDepositAvgPct) : "-"}</span></p>
          <p>warningsCount: <span className="font-semibold">{selectedWarnings}</span></p>
        </div>
      ) : null}

      {shouldSuggestSync ? (
        <p className="text-xs text-amber-800">
          {latestMissing ? "최신 계산 기준 데이터가 없습니다." : ""}
          {staleBeyondThreshold ? ` 기준일이 ${selectedStaleDays}일 지나 권장 기준 ${SNAPSHOT_STALE_CAUTION_DAYS}일을 초과했습니다.` : ""}
          {" "}
          <Link className="font-semibold underline" href="/settings/data-sources">데이터 상태 확인하기</Link>
        </p>
      ) : null}
    </div>
  );
}
