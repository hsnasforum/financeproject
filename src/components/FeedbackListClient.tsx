"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { filterAndSearch } from "@/lib/feedback/feedbackQuery";

type FeedbackCategory = "bug" | "improve" | "question";
type FeedbackStatus = "OPEN" | "DOING" | "DONE";
type FeedbackPriority = "P0" | "P1" | "P2" | "P3";

type FeedbackListItem = {
  id: string;
  createdAt: string;
  category: FeedbackCategory;
  message: string;
  traceId: string | null;
  url: string | null;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  dueDate: string | null;
  tags: string[];
  note: string;
};

type FeedbackListPayload = {
  ok?: boolean;
  data?: FeedbackListItem[];
  error?: {
    message?: string;
  };
};

type StatusFilter = "ALL" | FeedbackStatus;
type PriorityFilter = "ALL" | FeedbackPriority;
type DueFilter = "ALL" | "HAS_DUE" | "NO_DUE" | "OVERDUE";

const STATUS_FILTERS: StatusFilter[] = ["ALL", "OPEN", "DOING", "DONE"];
const PRIORITY_FILTERS: PriorityFilter[] = ["ALL", "P0", "P1", "P2", "P3"];
const DUE_FILTERS: DueFilter[] = ["ALL", "HAS_DUE", "NO_DUE", "OVERDUE"];

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR", { hour12: false });
}

function categoryLabel(category: FeedbackCategory): string {
  if (category === "bug") return "버그";
  if (category === "improve") return "개선";
  return "질문";
}

function statusLabel(status: StatusFilter): string {
  if (status === "ALL") return "ALL";
  if (status === "OPEN") return "OPEN";
  if (status === "DOING") return "DOING";
  return "DONE";
}

function parseStatusParam(value: string | null): StatusFilter {
  if (value === "OPEN" || value === "DOING" || value === "DONE") return value;
  return "ALL";
}

function parsePriorityParam(value: string | null): PriorityFilter {
  if (value === "P0" || value === "P1" || value === "P2" || value === "P3") return value;
  return "ALL";
}

function statusClassName(status: FeedbackStatus): string {
  if (status === "DONE") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "DOING") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-sky-50 text-sky-700 border-sky-200";
}

function priorityClassName(priority: FeedbackPriority): string {
  if (priority === "P0") return "bg-rose-50 text-rose-700 border-rose-200";
  if (priority === "P1") return "bg-amber-50 text-amber-700 border-amber-200";
  if (priority === "P2") return "bg-sky-50 text-sky-700 border-sky-200";
  return "bg-slate-100 text-slate-700 border-slate-300";
}

function dueLabel(value: string | null): string {
  return value ?? "-";
}

function isOverdue(value: string | null): boolean {
  if (!value) return false;
  const today = new Date().toISOString().slice(0, 10);
  return value < today;
}

function summarizeMessage(message: string, maxLength = 80): string {
  const compact = message.trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength)}...`;
}

function norm(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

export function FeedbackListClient() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FeedbackListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState(() => (searchParams.get("q") ?? "").trim());
  const [status, setStatus] = useState<StatusFilter>(() => parseStatusParam(searchParams.get("status")));
  const [priority, setPriority] = useState<PriorityFilter>(() => parsePriorityParam(searchParams.get("priority")));
  const [dueFilter, setDueFilter] = useState<DueFilter>("ALL");
  const [tag, setTag] = useState(() => (searchParams.get("tag") ?? "").trim());

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/feedback/list", { cache: "no-store" });
        const payload = (await response.json()) as FeedbackListPayload;
        if (!response.ok || !payload.ok || !Array.isArray(payload.data)) {
          throw new Error(payload.error?.message ?? "목록 조회 실패");
        }
        if (!active) return;
        setRows(payload.data);
        setError(null);
      } catch {
        if (!active) return;
        setRows([]);
        setError("피드백 목록을 불러오지 못했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const topTags = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const item of rows) {
      for (const raw of item.tags ?? []) {
        const key = norm(raw);
        if (!key) continue;
        const prev = map.get(key);
        if (prev) {
          prev.count += 1;
        } else {
          map.set(key, { label: raw.trim(), count: 1 });
        }
      }
    }
    return [...map.values()]
      .sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label))
      .slice(0, 10);
  }, [rows]);

  const searchedRows = useMemo(
    () => filterAndSearch(rows, { q, status, tag }),
    [rows, q, status, tag],
  );

  const filteredRows = useMemo(
    () => searchedRows.filter((item) => {
      if (priority !== "ALL" && item.priority !== priority) return false;
      if (dueFilter === "HAS_DUE") return Boolean(item.dueDate);
      if (dueFilter === "NO_DUE") return !item.dueDate;
      if (dueFilter === "OVERDUE") return isOverdue(item.dueDate);
      return true;
    }),
    [searchedRows, priority, dueFilter],
  );

  return (
    <PageShell>
      <PageHeader
        title="피드백 목록"
        description="저장된 사용자 피드백과 진단 첨부 여부를 확인합니다."
        action={
          <div className="flex items-center gap-2">
            <Link href="/feedback">
              <Button size="sm" variant="outline">의견 작성</Button>
            </Link>
            <Link href="/dashboard">
              <Button size="sm" variant="ghost">대시보드</Button>
            </Link>
          </div>
        }
      />

      <Card>
        {loading ? (
          <p className="text-sm text-slate-500">목록 로딩 중...</p>
        ) : error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">저장된 피드백이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-3">
              <label className="block text-xs text-slate-600">
                <span className="mb-1 block font-semibold text-slate-700">검색</span>
                <input
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="메시지/URL/traceId"
                  className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
                />
              </label>
              <div className="text-xs text-slate-600">
                <span className="mb-1 block font-semibold text-slate-700">상태</span>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_FILTERS.map((entry) => (
                    <button
                      key={entry}
                      type="button"
                      onClick={() => setStatus(entry)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        status === entry
                          ? "border-slate-700 bg-slate-700 text-white"
                          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {statusLabel(entry)}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block text-xs text-slate-600">
                <span className="mb-1 block font-semibold text-slate-700">우선순위</span>
                <select
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as PriorityFilter)}
                  className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
                >
                  {PRIORITY_FILTERS.map((entry) => (
                    <option key={entry} value={entry}>{entry}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-slate-600">
                <span className="mb-1 block font-semibold text-slate-700">마감일</span>
                <select
                  value={dueFilter}
                  onChange={(event) => setDueFilter(event.target.value as DueFilter)}
                  className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
                >
                  {DUE_FILTERS.map((entry) => (
                    <option key={entry} value={entry}>{entry}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="text-xs text-slate-600">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-semibold text-slate-700">태그</span>
                {tag ? (
                  <button
                    type="button"
                    onClick={() => setTag("")}
                    className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-50"
                  >
                    초기화
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {topTags.length === 0 ? (
                  <span className="text-slate-400">태그 없음</span>
                ) : (
                  topTags.map((entry) => {
                    const active = norm(tag) === norm(entry.label);
                    return (
                      <button
                        key={entry.label}
                        type="button"
                        onClick={() => setTag(active ? "" : entry.label)}
                        className={`rounded-full border px-2.5 py-1 text-xs ${
                          active
                            ? "border-emerald-300 bg-emerald-50 font-semibold text-emerald-700"
                            : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        #{entry.label} ({entry.count})
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <p className="text-xs text-slate-500">총 {rows.length}건 · 필터 결과 {filteredRows.length}건</p>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-semibold">카테고리</th>
                    <th className="px-3 py-2 font-semibold">상태</th>
                    <th className="px-3 py-2 font-semibold">우선순위</th>
                    <th className="px-3 py-2 font-semibold">마감일</th>
                    <th className="px-3 py-2 font-semibold">시간</th>
                    <th className="px-3 py-2 font-semibold">메시지</th>
                    <th className="px-3 py-2 font-semibold">traceId</th>
                    <th className="px-3 py-2 font-semibold">상세</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100 align-top last:border-0">
                      <td className="px-3 py-2 text-xs font-semibold text-slate-700">{categoryLabel(item.category)}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${statusClassName(item.status)}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${priorityClassName(item.priority)}`}>
                          {item.priority}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">{dueLabel(item.dueDate)}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{formatDateTime(item.createdAt)}</td>
                      <td className="px-3 py-2 text-sm text-slate-800">{summarizeMessage(item.message)}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{item.traceId ?? "-"}</td>
                      <td className="px-3 py-2 text-xs">
                        <Link href={`/feedback/${encodeURIComponent(item.id)}`} className="font-semibold text-emerald-700 hover:text-emerald-800">
                          보기
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </PageShell>
  );
}
