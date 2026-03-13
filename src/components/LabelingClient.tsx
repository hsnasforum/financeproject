"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DevUnlockShortcutMessage } from "@/components/DevUnlockShortcutLink";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";

const DEV_UNLOCKED_SESSION_KEY = "dev_action_unlocked_v1";
const DEV_CSRF_SESSION_KEY = "dev_action_csrf_v1";

type LabelingCategory = {
  id: string;
  label: string;
};

type LabelingItem = {
  key: string;
  corpCode: string;
  corpName: string;
  rceptDt: string;
  reportNm: string;
  rceptNo?: string;
  label: string | null;
  suggestion: {
    predictedCategoryId: string | null;
    score: number;
    level: "high" | "mid" | "low" | null;
    signals: string[];
    uncertain: boolean;
    unknown: boolean;
    threshold: number;
    normalizedTitle: string;
    noiseFlags: string[];
    tokenCount: number;
  };
};

type LabelsGetPayload = {
  ok?: boolean;
  data?: {
    mode?: string;
    total?: number;
    labeledCount?: number;
    unlabeledCount?: number;
    categories?: LabelingCategory[];
    items?: LabelingItem[];
  };
  error?: {
    message?: string;
  };
};

type UnlockState = {
  loading: boolean;
  unlocked: boolean;
  csrf: string | null;
  error: string | null;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDate(value: string): string {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return value || "-";
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof window === "undefined" || !(target instanceof Element)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return true;
  }
  return target.hasAttribute("contenteditable");
}

export function LabelingClient() {
  const [unlockToken, setUnlockToken] = useState("");
  const [unlock, setUnlock] = useState<UnlockState>({
    loading: false,
    unlocked: false,
    csrf: null,
    error: null,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [categories, setCategories] = useState<LabelingCategory[]>([]);
  const [items, setItems] = useState<LabelingItem[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    labeledCount: 0,
    unlabeledCount: 0,
  });

  const [query, setQuery] = useState("");
  const [uncertainOnly, setUncertainOnly] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    const unlocked = window.sessionStorage.getItem(DEV_UNLOCKED_SESSION_KEY) === "1";
    const csrf = window.sessionStorage.getItem(DEV_CSRF_SESSION_KEY);
    if (unlocked && csrf) {
      setUnlock((prev) => ({
        ...prev,
        unlocked: true,
        csrf,
      }));
    }
  }, []);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (uncertainOnly && !item.suggestion?.uncertain) return false;
      if (!q) return true;
      const haystack = `${item.corpCode} ${item.corpName} ${item.reportNm}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [items, query, uncertainOnly]);

  const currentItem = useMemo(() => {
    if (filteredItems.length < 1) return null;
    if (!activeKey) return filteredItems[0];
    const found = filteredItems.find((item) => item.key === activeKey);
    return found ?? filteredItems[0];
  }, [activeKey, filteredItems]);

  useEffect(() => {
    if (filteredItems.length < 1) {
      setActiveKey(null);
      return;
    }
    if (!currentItem) {
      setActiveKey(filteredItems[0].key);
      return;
    }
    setActiveKey(currentItem.key);
  }, [filteredItems, currentItem]);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/dev/dart/labels?mode=queue", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as LabelsGetPayload | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(payload?.error?.message ?? "라벨링 큐를 불러오지 못했습니다.");
      }

      const nextItems = Array.isArray(payload.data.items) ? payload.data.items : [];
      const nextCategories = Array.isArray(payload.data.categories) ? payload.data.categories : [];
      setItems(nextItems);
      setCategories(nextCategories);
      setSummary({
        total: typeof payload.data.total === "number" ? payload.data.total : nextItems.length,
        labeledCount: typeof payload.data.labeledCount === "number" ? payload.data.labeledCount : 0,
        unlabeledCount: typeof payload.data.unlabeledCount === "number" ? payload.data.unlabeledCount : nextItems.length,
      });
      setActiveKey(nextItems[0]?.key ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "라벨링 큐 조회 중 오류가 발생했습니다.");
      setItems([]);
      setCategories([]);
      setSummary({ total: 0, labeledCount: 0, unlabeledCount: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  async function handleUnlock() {
    const token = unlockToken.trim();
    if (!token) return;
    setUnlock((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch("/api/dev/unlock", {
        method: "POST",
        headers: { "x-dev-token": token },
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; csrf?: string; error?: { message?: string } } | null;
      if (response.ok && payload?.ok && payload.csrf) {
        window.sessionStorage.setItem(DEV_UNLOCKED_SESSION_KEY, "1");
        window.sessionStorage.setItem(DEV_CSRF_SESSION_KEY, payload.csrf);
        setUnlock({
          loading: false,
          unlocked: true,
          csrf: payload.csrf,
          error: null,
        });
        setNotice("Dev 잠금 해제가 완료되었습니다.");
        return;
      }
      setUnlock((prev) => ({
        ...prev,
        loading: false,
        error: payload?.error?.message ?? "잠금 해제에 실패했습니다.",
      }));
    } catch {
      setUnlock((prev) => ({
        ...prev,
        loading: false,
        error: "잠금 해제 요청 중 오류가 발생했습니다.",
      }));
    }
  }

  const recommendedCategoryId = useMemo(() => {
    const predicted = asString(currentItem?.suggestion?.predictedCategoryId);
    if (!predicted) return null;
    return categories.some((category) => category.id === predicted) ? predicted : null;
  }, [categories, currentItem]);

  const jumpBy = useCallback((step: -1 | 1) => {
    if (!currentItem) return;
    const index = filteredItems.findIndex((item) => item.key === currentItem.key);
    if (index < 0) return;
    const next = filteredItems[index + step];
    if (!next) return;
    setActiveKey(next.key);
  }, [currentItem, filteredItems]);

  const saveLabel = useCallback(async (label: string) => {
    if (!currentItem || saving) return;
    const csrf = asString(unlock.csrf || window.sessionStorage.getItem(DEV_CSRF_SESSION_KEY));
    if (!csrf) {
      setError("라벨 저장 전 Dev unlock/CSRF 확인이 필요합니다.");
      return;
    }

    const index = filteredItems.findIndex((item) => item.key === currentItem.key);
    const nextKey = filteredItems[index + 1]?.key ?? filteredItems[index - 1]?.key ?? null;

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/dev/dart/labels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          csrf,
          corpCode: currentItem.corpCode,
          rceptDt: currentItem.rceptDt,
          reportNm: currentItem.reportNm,
          label,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: { message?: string };
      } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error?.message ?? "라벨 저장에 실패했습니다.");
      }

      setItems((prev) => prev.filter((item) => item.key !== currentItem.key));
      setSummary((prev) => ({
        total: prev.total,
        labeledCount: prev.labeledCount + 1,
        unlabeledCount: Math.max(0, prev.unlabeledCount - 1),
      }));
      setActiveKey(nextKey);
      setNotice(`저장 완료: ${label}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "라벨 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }, [currentItem, filteredItems, saving, unlock.csrf]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (saving) return;
      if (isEditableTarget(event.target)) return;
      const key = event.key;

      if (key === "n" || key === "N") {
        event.preventDefault();
        jumpBy(1);
        return;
      }
      if (key === "p" || key === "P") {
        event.preventDefault();
        jumpBy(-1);
        return;
      }
      if (key === "a" || key === "A") {
        if (!recommendedCategoryId) return;
        event.preventDefault();
        void saveLabel(recommendedCategoryId);
        return;
      }
      if (!/^[1-9]$/.test(key)) return;
      const index = Number(key) - 1;
      const category = categories[index];
      if (!category) return;
      event.preventDefault();
      void saveLabel(category.id);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [categories, jumpBy, recommendedCategoryId, saveLabel, saving]);

  const currentIndex = currentItem
    ? filteredItems.findIndex((item) => item.key === currentItem.key)
    : -1;
  const progressRate = summary.total > 0
    ? ((summary.labeledCount / summary.total) * 100).toFixed(1)
    : "0.0";

  return (
    <PageShell>
      <PageHeader
        title="DART 라벨링"
        description="공시 라벨을 빠르게 수집하고 labels.csv로 저장합니다."
        action={(
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void loadQueue()} disabled={loading}>
              {loading ? "로딩..." : "큐 새로고침"}
            </Button>
            <Link href="/ops">
              <Button type="button" variant="outline" size="sm">Ops Hub</Button>
            </Link>
          </div>
        )}
      />

      <Card>
        <h2 className="text-base font-black text-slate-900">Dev Unlock</h2>
        <p className="mt-2 text-sm text-slate-600">라벨 저장(POST) 전 unlock이 필요합니다.</p>
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
          <input
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none ring-emerald-200 transition focus:border-emerald-400 focus:ring"
            type="password"
            placeholder="DEV_TOKEN"
            value={unlockToken}
            onChange={(event) => setUnlockToken(event.target.value)}
          />
          <Button type="button" variant="outline" size="md" onClick={handleUnlock} disabled={unlock.loading}>
            {unlock.loading ? "해제 중..." : unlock.unlocked ? "해제됨" : "잠금 해제"}
          </Button>
        </div>
        {unlock.error ? <p className="mt-2 text-sm font-semibold text-rose-600">{unlock.error}</p> : null}
      </Card>

      <Card className="mt-6">
        <h2 className="text-base font-black text-slate-900">진행 상태</h2>
        <div className="mt-3 grid gap-2 text-sm md:grid-cols-4">
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">전체: <span className="font-semibold">{summary.total}</span></p>
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">완료: <span className="font-semibold">{summary.labeledCount}</span></p>
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">대기: <span className="font-semibold">{summary.unlabeledCount}</span></p>
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">진행률: <span className="font-semibold">{progressRate}%</span></p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none ring-emerald-200 transition focus:border-emerald-400 focus:ring"
            placeholder="회사/종목코드/제목 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={uncertainOnly}
              onChange={(event) => setUncertainOnly(event.target.checked)}
            />
            불확실만
          </label>
        </div>

        {error ? (
          <DevUnlockShortcutMessage
            className="mt-3 text-sm font-semibold text-rose-600"
            linkClassName="text-rose-600"
            message={error}
          />
        ) : null}
        {notice ? <p className="mt-3 text-sm font-semibold text-emerald-700">{notice}</p> : null}
      </Card>

      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-black text-slate-900">현재 항목</h2>
          <p className="text-xs text-slate-500">
            {filteredItems.length > 0 && currentIndex >= 0 ? `${currentIndex + 1}/${filteredItems.length}` : "0/0"}
          </p>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">큐 로딩 중...</p>
        ) : !currentItem ? (
          <p className="mt-4 text-sm text-slate-500">표시할 항목이 없습니다. (필터 또는 큐 상태 확인)</p>
        ) : (
          <>
            <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">corpCode</p>
              <p className="text-sm font-semibold text-slate-900">{currentItem.corpCode} / {currentItem.corpName}</p>
              <p className="text-xs text-slate-500">rceptDt</p>
              <p className="text-sm font-semibold text-slate-900">{formatDate(currentItem.rceptDt)}</p>
              <p className="text-xs text-slate-500">reportNm</p>
              <p className="text-sm font-semibold text-slate-900">{currentItem.reportNm}</p>
              <p className="text-xs text-slate-500">추천 라벨</p>
              <p className="text-sm font-semibold text-slate-900">
                {currentItem.suggestion?.predictedCategoryId ?? "-"}
                {" "}
                (score {currentItem.suggestion?.score ?? 0}, {currentItem.suggestion?.level ?? "-"})
              </p>
              <p className="text-xs text-slate-500">
                uncertain: {currentItem.suggestion?.uncertain ? "true" : "false"}
                {" / "}
                threshold: {currentItem.suggestion?.threshold ?? "-"}
              </p>
              <p className="text-xs text-slate-500">
                noiseFlags: {(currentItem.suggestion?.noiseFlags ?? []).slice(0, 4).join(", ") || "-"}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => {
                  if (!recommendedCategoryId) return;
                  void saveLabel(recommendedCategoryId);
                }}
                disabled={saving || !recommendedCategoryId}
              >
                추천 승인 (A)
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {categories.map((category, index) => {
                const shortcut = index < 9 ? `${index + 1}` : null;
                const isSuggested = category.id === recommendedCategoryId;
                return (
                <Button
                  key={category.id}
                  type="button"
                  size="sm"
                  variant={isSuggested ? "primary" : "outline"}
                  onClick={() => void saveLabel(category.id)}
                  disabled={saving}
                >
                  {shortcut ? `${shortcut}. ` : ""}{category.id}{isSuggested ? " (추천)" : ""}
                </Button>
                );
              })}
            </div>
          </>
        )}

        <div className="mt-5 flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => jumpBy(-1)}
            disabled={!currentItem || currentIndex <= 0 || saving}
          >
            이전
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => jumpBy(1)}
            disabled={!currentItem || currentIndex < 0 || currentIndex >= filteredItems.length - 1 || saving}
          >
            다음
          </Button>
          <p className="ml-2 text-xs text-slate-500">
            단축키: `1-9` 라벨, `A` 추천 승인, `N` 다음, `P` 이전
          </p>
        </div>
      </Card>
    </PageShell>
  );
}
