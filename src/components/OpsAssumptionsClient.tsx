"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { resolveClientApiError } from "@/lib/http/clientApiError";
import { type AssumptionsSnapshot } from "@/lib/planning/assumptions/types";

type AssumptionsOverrideKey = "inflationPct" | "investReturnPct" | "cashReturnPct" | "withdrawalRatePct";
type AssumptionsOverrideItem = {
  key: AssumptionsOverrideKey;
  value: number;
  reason: string;
  updatedAt: string;
};

type LatestPayload = {
  ok?: boolean;
  snapshot?: AssumptionsSnapshot;
  snapshotId?: string;
  message?: string;
  error?: { code?: string; message?: string; fixHref?: string };
};

type RefreshPayload = {
  ok?: boolean;
  message?: string;
  error?: { code?: string; message?: string; fixHref?: string };
  snapshotSummary?: {
    snapshotId?: string;
    asOf?: string;
    fetchedAt?: string;
    korea?: AssumptionsSnapshot["korea"];
    warningsCount?: number;
    sourcesCount?: number;
  };
};

type OverridesPayload = {
  ok?: boolean;
  items?: AssumptionsOverrideItem[];
  message?: string;
  error?: { code?: string; message?: string; fixHref?: string };
};

type OpsAssumptionsClientProps = {
  csrf: string;
  ecosConfigured: boolean;
  initialProfiles?: Array<{
    profileId: string;
    name: string;
    isDefault?: boolean;
  }>;
  initialSelectedProfileId?: string;
};

const OVERRIDE_KEYS: Array<{ key: AssumptionsOverrideKey; label: string }> = [
  { key: "inflationPct", label: "Inflation %" },
  { key: "investReturnPct", label: "Invest Return %" },
  { key: "cashReturnPct", label: "Cash Return %" },
  { key: "withdrawalRatePct", label: "Withdrawal Rate %" },
];

function formatDateTime(value: string | undefined): string {
  if (!value) return "-";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "-";
  return new Date(parsed).toLocaleString("ko-KR", { hour12: false });
}

function formatMetric(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function toHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "-";
  }
}

export function OpsAssumptionsClient(props: OpsAssumptionsClientProps) {
  const initialProfiles = props.initialProfiles ?? [];
  const initialSelectedProfileId = props.initialSelectedProfileId
    || initialProfiles.find((row) => row.isDefault)?.profileId
    || initialProfiles[0]?.profileId
    || "";
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [errorFixHref, setErrorFixHref] = useState("");
  const [snapshot, setSnapshot] = useState<AssumptionsSnapshot | null>(null);
  const [snapshotId, setSnapshotId] = useState<string>("");
  const [showSourceDetails, setShowSourceDetails] = useState(false);
  const [overrides, setOverrides] = useState<AssumptionsOverrideItem[]>([]);
  const [overridesLoading, setOverridesLoading] = useState(false);
  const [overridesSaving, setOverridesSaving] = useState(false);
  const [overridesError, setOverridesError] = useState("");
  const [profileOptions, setProfileOptions] = useState(initialProfiles);
  const [selectedProfileId, setSelectedProfileId] = useState(initialSelectedProfileId);

  const hasCsrf = props.csrf.trim().length > 0;

  const loadProfileOptions = useCallback(async () => {
    try {
      const response = await fetch("/api/planning/profiles", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        data?: Array<{ profileId?: string; name?: string; isDefault?: boolean }>;
        meta?: { defaultProfileId?: string };
      } | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) return;
      const rows = payload.data
        .map((row) => ({
          profileId: typeof row.profileId === "string" ? row.profileId.trim() : "",
          name: typeof row.name === "string" ? row.name.trim() : "",
          isDefault: row.isDefault === true,
        }))
        .filter((row) => row.profileId.length > 0);
      if (rows.length < 1) return;
      setProfileOptions(rows);
      setSelectedProfileId((prev) => {
        if (prev && rows.some((row) => row.profileId === prev)) return prev;
        if (typeof payload.meta?.defaultProfileId === "string" && rows.some((row) => row.profileId === payload.meta?.defaultProfileId)) {
          return payload.meta.defaultProfileId;
        }
        return rows.find((row) => row.isDefault)?.profileId ?? rows[0].profileId;
      });
    } catch {
      // ignore profile options refresh failure
    }
  }, []);

  const visibleMetrics = useMemo(
    () => [
      { key: "policyRatePct", label: "Policy Rate", value: snapshot?.korea.policyRatePct },
      { key: "callOvernightPct", label: "Call Overnight", value: snapshot?.korea.callOvernightPct },
      { key: "cd91Pct", label: "CD 91D", value: snapshot?.korea.cd91Pct },
      { key: "koribor3mPct", label: "KORIBOR 3M", value: snapshot?.korea.koribor3mPct },
      { key: "msb364Pct", label: "MSB 364D", value: snapshot?.korea.msb364Pct },
      { key: "baseRatePct", label: "Base Rate", value: snapshot?.korea.baseRatePct },
      { key: "cpiYoYPct", label: "CPI YoY", value: snapshot?.korea.cpiYoYPct },
      { key: "coreCpiYoYPct", label: "Core CPI YoY", value: snapshot?.korea.coreCpiYoYPct },
      { key: "newDepositAvgPct", label: "New Deposit Avg", value: snapshot?.korea.newDepositAvgPct },
      { key: "newLoanAvgPct", label: "New Loan Avg", value: snapshot?.korea.newLoanAvgPct },
    ].filter((item) => typeof item.value === "number"),
    [snapshot],
  );

  const loadLatest = useCallback(async () => {
    if (!hasCsrf) {
      setLoading(false);
      setSnapshot(null);
      setError("Dev unlock/CSRF가 없어 조회할 수 없습니다.");
      setErrorFixHref("");
      return;
    }

    setLoading(true);
    setError("");
    setErrorFixHref("");

    try {
      const response = await fetch(`/api/ops/assumptions/latest?csrf=${encodeURIComponent(props.csrf)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as LatestPayload | null;

      if (!response.ok) {
        const apiError = resolveClientApiError(payload, "가정 스냅샷 조회에 실패했습니다.");
        setErrorFixHref(apiError.fixHref ?? "");
        throw new Error(apiError.message);
      }

      if (!payload?.ok || !payload.snapshot) {
        const apiError = resolveClientApiError(payload, "저장된 가정 스냅샷이 없습니다.");
        setSnapshot(null);
        setSnapshotId("");
        setError(apiError.message);
        setErrorFixHref(apiError.fixHref ?? "");
        return;
      }

      setSnapshot(payload.snapshot);
      setSnapshotId(typeof payload.snapshotId === "string" ? payload.snapshotId : "");
    } catch (loadError) {
      setSnapshot(null);
      setSnapshotId("");
      setError(loadError instanceof Error ? loadError.message : "가정 스냅샷 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [hasCsrf, props.csrf]);

  const loadOverrides = useCallback(async () => {
    if (!hasCsrf) {
      setOverrides([]);
      setOverridesError("Dev unlock/CSRF가 없어 오버라이드를 조회할 수 없습니다.");
      return;
    }

    setOverridesLoading(true);
    setOverridesError("");
    try {
      const params = new URLSearchParams();
      params.set("csrf", props.csrf);
      if (selectedProfileId) params.set("profileId", selectedProfileId);
      const response = await fetch(`/api/ops/assumptions/overrides?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as OverridesPayload | null;
      if (!response.ok || !payload?.ok) {
        const apiError = resolveClientApiError(payload, "오버라이드 조회에 실패했습니다.");
        throw new Error(apiError.message);
      }
      setOverrides(Array.isArray(payload.items) ? payload.items : []);
    } catch (loadError) {
      setOverrides([]);
      setOverridesError(loadError instanceof Error ? loadError.message : "오버라이드 조회에 실패했습니다.");
    } finally {
      setOverridesLoading(false);
    }
  }, [hasCsrf, props.csrf, selectedProfileId]);

  const saveOverrides = useCallback(async () => {
    if (!hasCsrf) {
      window.alert("Dev unlock/CSRF가 필요합니다. /ops/rules에서 unlock 후 다시 시도해 주세요.");
      return;
    }
    setOverridesSaving(true);
    setOverridesError("");
    try {
      const response = await fetch("/api/ops/assumptions/overrides", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          csrf: props.csrf,
          ...(selectedProfileId ? { profileId: selectedProfileId } : {}),
          items: overrides,
        }),
      });
      const payload = (await response.json().catch(() => null)) as OverridesPayload | null;
      if (!response.ok || !payload?.ok) {
        const apiError = resolveClientApiError(payload, "오버라이드 저장에 실패했습니다.");
        throw new Error(apiError.message);
      }
      setOverrides(Array.isArray(payload.items) ? payload.items : []);
      window.alert(payload.message ?? "가정 오버라이드를 저장했습니다.");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "오버라이드 저장에 실패했습니다.";
      setOverridesError(message);
      window.alert(message);
    } finally {
      setOverridesSaving(false);
    }
  }, [hasCsrf, overrides, props.csrf, selectedProfileId]);

  const resetOverrides = useCallback(async () => {
    if (!hasCsrf) {
      window.alert("Dev unlock/CSRF가 필요합니다. /ops/rules에서 unlock 후 다시 시도해 주세요.");
      return;
    }
    if (!window.confirm("저장된 가정 오버라이드를 모두 초기화할까요?")) return;
    setOverridesSaving(true);
    setOverridesError("");
    try {
      const response = await fetch("/api/ops/assumptions/overrides/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          csrf: props.csrf,
          ...(selectedProfileId ? { profileId: selectedProfileId } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as OverridesPayload | null;
      if (!response.ok || !payload?.ok) {
        const apiError = resolveClientApiError(payload, "오버라이드 초기화에 실패했습니다.");
        throw new Error(apiError.message);
      }
      setOverrides([]);
      window.alert(payload.message ?? "가정 오버라이드를 초기화했습니다.");
    } catch (resetError) {
      const message = resetError instanceof Error ? resetError.message : "오버라이드 초기화에 실패했습니다.";
      setOverridesError(message);
      window.alert(message);
    } finally {
      setOverridesSaving(false);
    }
  }, [hasCsrf, props.csrf, selectedProfileId]);

  const refreshNow = useCallback(async () => {
    if (!hasCsrf) {
      window.alert("Dev unlock/CSRF가 필요합니다. /ops/rules에서 unlock 후 다시 시도해 주세요.");
      return;
    }

    setSyncing(true);
    try {
      const response = await fetch("/api/ops/assumptions/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csrf: props.csrf }),
      });
      const payload = (await response.json().catch(() => null)) as RefreshPayload | null;

      if (!response.ok || !payload?.ok) {
        const apiError = resolveClientApiError(payload, "가정 동기화에 실패했습니다.");
        throw new Error(`${apiError.message}${apiError.fixHref ? ` (${apiError.fixHref})` : ""}`);
      }

      window.alert(payload.message ?? "가정 스냅샷 동기화를 완료했습니다.");
      await loadLatest();
    } catch (syncError) {
      window.alert(syncError instanceof Error ? syncError.message : "가정 동기화 중 오류가 발생했습니다.");
    } finally {
      setSyncing(false);
    }
  }, [hasCsrf, loadLatest, props.csrf]);

  const addOverrideRow = useCallback(() => {
    const usedKeys = new Set(overrides.map((item) => item.key));
    const firstAvailable = OVERRIDE_KEYS.find((row) => !usedKeys.has(row.key))?.key ?? OVERRIDE_KEYS[0].key;
    setOverrides((prev) => [
      ...prev,
      {
        key: firstAvailable,
        value: 0,
        reason: "",
        updatedAt: new Date().toISOString(),
      },
    ]);
  }, [overrides]);

  const updateOverrideRow = useCallback((index: number, patch: Partial<AssumptionsOverrideItem>) => {
    setOverrides((prev) => prev.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      return {
        ...row,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
    }));
  }, []);

  const removeOverrideRow = useCallback((index: number) => {
    setOverrides((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  }, []);

  useEffect(() => {
    void loadProfileOptions();
  }, [loadProfileOptions]);

  useEffect(() => {
    void loadLatest();
    void loadOverrides();
  }, [loadLatest, loadOverrides]);

  return (
    <PageShell>
      <PageHeader
        title="가정 스냅샷"
        description="플래닝 엔진에서 사용하는 공개 매크로 가정 스냅샷을 조회/동기화합니다. (Dev only)"
        action={(
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void loadLatest()} disabled={loading || syncing || !hasCsrf}>
              {loading ? "로딩 중..." : "새로고침"}
            </Button>
            <Button type="button" size="sm" onClick={() => void refreshNow()} disabled={syncing || !hasCsrf}>
              {syncing ? "새로고침 중..." : "지금 새로고침"}
            </Button>
            <Link href="/ops">
              <Button type="button" variant="outline" size="sm">Ops Hub</Button>
            </Link>
            <Link href="/ops/assumptions/history">
              <Button type="button" variant="outline" size="sm">히스토리 / 비교</Button>
            </Link>
            <Link href="/settings/backup">
              <Button type="button" variant="outline" size="sm">Backup / Restore</Button>
            </Link>
          </div>
        )}
      />

      <Card>
        <h2 className="text-base font-black text-slate-900">현재 스냅샷</h2>
        <p className="mt-2 text-sm text-slate-600">엔진은 네트워크를 호출하지 않고, 마지막 저장된 스냅샷만 사용합니다.</p>

        {!hasCsrf ? (
          <p className="mt-3 text-sm font-semibold text-amber-700">Dev unlock/CSRF가 없어 조회/동기화가 차단됩니다.</p>
        ) : null}

        {error ? (
          <p className="mt-3 text-sm font-semibold text-rose-600">
            {error}
            {errorFixHref ? (
              <>
                {" "}
                <Link href={errorFixHref} className="underline">{errorFixHref}</Link>
              </>
            ) : null}
          </p>
        ) : null}

        <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">snapshotId: <span className="font-semibold">{snapshotId || "-"}</span></div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">asOf: <span className="font-semibold">{snapshot?.asOf ?? "-"}</span></div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">fetchedAt: <span className="font-semibold">{formatDateTime(snapshot?.fetchedAt)}</span></div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">ECOS configured: <span className="font-semibold">{props.ecosConfigured ? "true" : "false"}</span></div>
        </div>

        <div className="mt-4 grid gap-2 text-sm md:grid-cols-2 lg:grid-cols-3">
          {visibleMetrics.length > 0 ? visibleMetrics.map((metric) => (
            <div key={metric.key} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              {metric.label}: <span className="font-semibold">{formatMetric(metric.value)}</span>
            </div>
          )) : (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500">표시 가능한 금리/물가 값이 없습니다.</div>
          )}
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-black text-slate-900">Warnings ({snapshot?.warnings.length ?? 0})</h3>
            {snapshot && snapshot.warnings.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-rose-700">
                {snapshot.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>- {warning}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-500">경고 없음</p>
            )}
          </div>

          <div>
            <h3 className="text-sm font-black text-slate-900">Sources ({snapshot?.sources.length ?? 0})</h3>
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600">
              <input
                checked={showSourceDetails}
                onChange={(event) => setShowSourceDetails(event.target.checked)}
                type="checkbox"
              />
              고급 보기(소스 URL)
            </label>
            {snapshot && snapshot.sources.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {snapshot.sources.map((source, index) => (
                  <li key={`${source.name}-${index}`}>
                    - {source.name} ({formatDateTime(source.fetchedAt)})
                    {showSourceDetails ? ` / ${toHost(source.url)} / ${source.url}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-500">소스 정보 없음</p>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-black text-slate-900">Overrides</h2>
            <p className="mt-1 text-xs text-slate-600">스냅샷 가정을 런타임에 덮어쓸 값을 저장합니다. 값은 % 단위입니다.</p>
            <p className="mt-1 text-[11px] text-slate-500">스냅샷 히스토리는 공유되고, 오버라이드는 profileId별로 분리 저장됩니다.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addOverrideRow}
              disabled={overridesSaving || overridesLoading || !hasCsrf}
            >
              행 추가
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void loadOverrides()}
              disabled={overridesSaving || overridesLoading || !hasCsrf}
            >
              {overridesLoading ? "로딩 중..." : "다시 불러오기"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void saveOverrides()}
              disabled={overridesSaving || overridesLoading || !hasCsrf}
            >
              {overridesSaving ? "저장 중..." : "저장"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void resetOverrides()}
              disabled={overridesSaving || overridesLoading || !hasCsrf}
            >
              초기화
            </Button>
          </div>
        </div>

        <div className="mt-3 max-w-sm">
          <label className="block text-[11px] font-semibold text-slate-700" htmlFor="ops-assumptions-profile-selector">
            대상 프로필
          </label>
          <select
            className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
            id="ops-assumptions-profile-selector"
            value={selectedProfileId}
            onChange={(event) => setSelectedProfileId(event.target.value)}
          >
            {profileOptions.length < 1 ? <option value="">프로필 없음</option> : null}
            {profileOptions.map((row) => (
              <option key={row.profileId} value={row.profileId}>
                {row.name} ({row.profileId})
                {row.isDefault ? " · default" : ""}
              </option>
            ))}
          </select>
        </div>

        {overridesError ? (
          <p className="mt-3 text-xs font-semibold text-rose-600">{overridesError}</p>
        ) : null}

        {overrides.length > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-2 py-2 text-left">Key</th>
                  <th className="px-2 py-2 text-left">Value(%)</th>
                  <th className="px-2 py-2 text-left">Reason</th>
                  <th className="px-2 py-2 text-left">Updated</th>
                  <th className="px-2 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {overrides.map((row, index) => (
                  <tr key={`${row.key}-${index}`}>
                    <td className="px-2 py-2">
                      <select
                        className="h-8 rounded border border-slate-300 px-2"
                        value={row.key}
                        onChange={(event) => updateOverrideRow(index, { key: event.target.value as AssumptionsOverrideKey })}
                      >
                        {OVERRIDE_KEYS.map((item) => (
                          <option key={item.key} value={item.key}>{item.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="h-8 w-28 rounded border border-slate-300 px-2"
                        inputMode="decimal"
                        type="number"
                        value={row.value}
                        onChange={(event) => updateOverrideRow(index, { value: Number(event.target.value) })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="h-8 w-full min-w-56 rounded border border-slate-300 px-2"
                        placeholder="사유 입력"
                        type="text"
                        value={row.reason}
                        onChange={(event) => updateOverrideRow(index, { reason: event.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2 text-slate-500">{formatDateTime(row.updatedAt)}</td>
                    <td className="px-2 py-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => removeOverrideRow(index)}
                      >
                        삭제
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-xs text-slate-500">저장된 오버라이드가 없습니다.</p>
        )}
      </Card>
    </PageShell>
  );
}
