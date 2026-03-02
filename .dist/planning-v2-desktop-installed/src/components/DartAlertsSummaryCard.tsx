"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArtifactQuickActions } from "@/components/ArtifactQuickActions";
import { Card } from "@/components/ui/Card";
import {
  applyState,
  emptyAlertState,
  loadAlertState,
  markRead,
  muteCluster,
  saveAlertState,
  togglePin,
  type AlertState,
} from "@/lib/dart/alertStateStore";
import {
  ALERT_RULES_CHANGED_EVENT,
  ALERT_RULES_STORAGE_KEY,
  applyRules,
  loadRules,
  type AlertRule,
} from "@/lib/dart/alertRulesStore";
import { defaultAlertPrefs, loadUserPrefs, mergePrefs, type AlertPreferences } from "@/lib/dart/alertPreferences";

type AlertItem = {
  id?: string;
  clusterKey?: string;
  corpCode?: string;
  corpName: string;
  categoryId?: string;
  categoryLabel: string;
  title: string;
  normalizedTitle?: string;
  rceptNo: string;
  date?: string | null;
  clusterScore: number;
};

type AlertsData = {
  generatedAt: string | null;
  newHigh: AlertItem[];
  newMid: AlertItem[];
  updatedHigh: AlertItem[];
  updatedMid: AlertItem[];
};

type AlertsApiPayload = {
  ok?: boolean;
  data?: AlertsData;
};

const EMPTY_ALERTS: AlertsData = {
  generatedAt: null,
  newHigh: [],
  newMid: [],
  updatedHigh: [],
  updatedMid: [],
};

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR");
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return "-";
  const text = value.trim();
  if (/^\d{8}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("ko-KR");
}

type AlertListItem = AlertItem & {
  level: "high" | "mid";
  kind: "new" | "updated";
  isNew: boolean;
};

const ALERT_PREFS_STORAGE_KEY = "dart_alert_prefs_v1";
const ALERT_PREFS_CHANGED_EVENT = "dart-alert-prefs-changed";

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function applyLocalPrefs(items: AlertListItem[], prefs: AlertPreferences): AlertListItem[] {
  const includeSet = new Set(prefs.includeCategories.map((value) => value.toLowerCase()));
  const excludeFlags = prefs.excludeFlags.map((value) => value.toLowerCase());
  const filtered = [...items]
    .filter((item) => toNumber(item.clusterScore, 0) >= prefs.minScore)
    .filter((item) => includeSet.size === 0 || includeSet.has((item.categoryLabel ?? "").toLowerCase()))
    .filter((item) => {
      if (excludeFlags.length === 0) return true;
      const title = (item.title ?? "").toLowerCase();
      return !excludeFlags.some((flag) => title.includes(flag));
    })
    .sort((a, b) => {
      const scoreDiff = toNumber(b.clusterScore, 0) - toNumber(a.clusterScore, 0);
      if (scoreDiff !== 0) return scoreDiff;
      const dateA = toDateMillis(a.date);
      const dateB = toDateMillis(b.date);
      if (dateA !== dateB) return dateB - dateA;
      return (a.id ?? "").localeCompare(b.id ?? "");
    });

  const perCorp = new Map<string, number>();
  const limited: AlertListItem[] = [];
  for (const item of filtered) {
    const corp = item.corpName || "-";
    const count = perCorp.get(corp) ?? 0;
    if (count >= prefs.maxPerCorp) continue;
    perCorp.set(corp, count + 1);
    limited.push(item);
    if (limited.length >= prefs.maxItems) break;
  }
  return limited;
}

function toDateMillis(value: string | null | undefined): number {
  if (!value) return 0;
  const text = value.trim();
  if (/^\d{8}$/.test(text)) {
    const year = Number(text.slice(0, 4));
    const month = Number(text.slice(4, 6)) - 1;
    const day = Number(text.slice(6, 8));
    const parsed = Date.UTC(year, month, day);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dedupeByAlertId<T extends { id: string }>(items: T[]): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function DartAlertsSummaryCard({ showQuickActions = false }: { showQuickActions?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<AlertsData>(EMPTY_ALERTS);
  const [alertState, setAlertState] = useState<AlertState>(emptyAlertState());
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [localPrefs, setLocalPrefs] = useState<AlertPreferences>(defaultAlertPrefs());

  useEffect(() => {
    let active = true;
    setAlertState(loadAlertState());
    setAlertRules(loadRules());
    setLocalPrefs(mergePrefs(defaultAlertPrefs(), loadUserPrefs(ALERT_PREFS_STORAGE_KEY)));

    const onRulesChanged = () => setAlertRules(loadRules());
    const onPrefsChanged = () => {
      setLocalPrefs(mergePrefs(defaultAlertPrefs(), loadUserPrefs(ALERT_PREFS_STORAGE_KEY)));
    };
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === ALERT_RULES_STORAGE_KEY) {
        setAlertRules(loadRules());
      }
      if (!event.key || event.key === ALERT_PREFS_STORAGE_KEY) {
        setLocalPrefs(mergePrefs(defaultAlertPrefs(), loadUserPrefs(ALERT_PREFS_STORAGE_KEY)));
      }
    };
    window.addEventListener(ALERT_RULES_CHANGED_EVENT, onRulesChanged);
    window.addEventListener(ALERT_PREFS_CHANGED_EVENT, onPrefsChanged);
    window.addEventListener("storage", onStorage);

    async function load() {
      try {
        const response = await fetch("/api/dev/dart/alerts", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = (await response.json()) as AlertsApiPayload;
        if (!active) return;
        setAlerts(payload.data ?? EMPTY_ALERTS);
      } catch {
        if (!active) return;
        setAlerts(EMPTY_ALERTS);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
      window.removeEventListener(ALERT_RULES_CHANGED_EVENT, onRulesChanged);
      window.removeEventListener(ALERT_PREFS_CHANGED_EVENT, onPrefsChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const listItems = useMemo<AlertListItem[]>(() => {
    return [
      ...alerts.newHigh.map((item) => ({ ...item, level: "high" as const, kind: "new" as const, isNew: true })),
      ...alerts.newMid.map((item) => ({ ...item, level: "mid" as const, kind: "new" as const, isNew: true })),
      ...alerts.updatedHigh.map((item) => ({ ...item, level: "high" as const, kind: "updated" as const, isNew: false })),
      ...alerts.updatedMid.map((item) => ({ ...item, level: "mid" as const, kind: "updated" as const, isNew: false })),
    ];
  }, [alerts.newHigh, alerts.newMid, alerts.updatedHigh, alerts.updatedMid]);

  const visibleItems = useMemo(() => {
    const prefsFiltered = applyLocalPrefs(listItems, localPrefs);
    const rulesFiltered = applyRules(prefsFiltered, alertRules);
    return dedupeByAlertId(applyState(rulesFiltered, alertState)).slice(0, 5);
  }, [alertRules, alertState, listItems, localPrefs]);

  function updateAlertState(updater: (prev: AlertState) => AlertState): void {
    setAlertState((prev) => {
      const next = updater(prev);
      saveAlertState(next);
      return next;
    });
  }

  return (
    <Card className="p-8 border-slate-100 bg-white shadow-lg shadow-slate-200/30 rounded-[2rem] hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800">오늘 공시 알림</h3>
          <p className="text-xs text-slate-400 mt-1">신규/업데이트 High/Mid</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/settings/alerts" className="text-xs font-bold text-slate-600 hover:text-slate-800">
            규칙 설정
          </Link>
          <Link href="/public/dart" className="text-xs font-bold text-emerald-700 hover:text-emerald-800">
            전체 보기
          </Link>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-slate-400">generatedAt: {formatDateTime(alerts.generatedAt)}</p>

      {loading ? (
        <p className="mt-4 text-xs text-slate-500">알림 로딩 중...</p>
      ) : visibleItems.length === 0 ? (
        <p className="mt-4 text-xs text-slate-500">표시할 공시 알림이 없습니다.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {visibleItems.map((item) => (
            <li key={item.id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-bold text-slate-800">{item.corpName} · {item.title}</p>
                <div className="flex shrink-0 items-center gap-1">
                  {item.showNewBadge ? (
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">NEW</span>
                  ) : null}
                  {item.isPinned ? (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">PIN</span>
                  ) : null}
                </div>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {item.categoryLabel} · score {item.clusterScore} · {formatShortDate(item.date)}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
                  onClick={() => updateAlertState((prev) => markRead(item.id, prev))}
                >
                  읽음
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:border-amber-300 hover:text-amber-700"
                  onClick={() => updateAlertState((prev) => togglePin(item.id, prev))}
                >
                  {item.isPinned ? "핀해제" : "핀"}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:border-rose-300 hover:text-rose-700"
                  onClick={() => updateAlertState((prev) => muteCluster(item.clusterKey, prev))}
                >
                  무시
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showQuickActions ? (
        <div className="mt-4">
          <ArtifactQuickActions artifactName="alerts_md" label="공시 알림 빠른 작업" />
        </div>
      ) : null}
    </Card>
  );
}
