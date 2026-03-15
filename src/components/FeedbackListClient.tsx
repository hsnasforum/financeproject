"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { filterAndSearch } from "@/lib/feedback/feedbackQuery";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { cn } from "@/lib/utils";

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
              <Button size="sm" variant="outline" className="rounded-2xl font-black">의견 작성</Button>
            </Link>
          </div>
        }
      />

      {loading ? (
        <LoadingState title="피드백 목록을 불러오고 있습니다" />
      ) : error ? (
        <Card className="rounded-[2rem] p-12 text-center border-rose-100 bg-rose-50/30">
          <p className="text-sm font-black text-rose-600">{error}</p>
          <Button variant="outline" size="sm" className="mt-4 rounded-xl font-black" onClick={() => window.location.reload()}>다시 시도</Button>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState 
          title="저장된 피드백이 없습니다" 
          description="사용자의 의견이 등록되면 이곳에서 확인할 수 있습니다."
          icon="data"
          actionLabel="첫 의견 작성하기"
          onAction={() => window.location.href = "/feedback"}
        />
      ) : (
        <div className="space-y-6">
          <Card className="rounded-[2rem] p-8 shadow-sm">
            <SubSectionHeader title="필터 및 검색" description={`총 ${rows.length}건 중 ${filteredRows.length}건 표시 중`} />
            
            <div className="mt-6 space-y-6">
              <div className="grid gap-6 md:grid-cols-4">
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">검색어</span>
                  <input
                    value={q}
                    onChange={(event) => setQ(event.target.value)}
                    placeholder="메시지/URL/traceId"
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none"
                  />
                </div>
                
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">상태 필터</span>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS_FILTERS.map((entry) => (
                      <button
                        key={entry}
                        type="button"
                        onClick={() => setStatus(entry)}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-xs font-black transition-all shadow-sm",
                          status === entry
                            ? "bg-slate-900 text-white"
                            : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
                        )}
                      >
                        {statusLabel(entry)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">우선순위</span>
                  <select
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as PriorityFilter)}
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none"
                  >
                    {PRIORITY_FILTERS.map((entry) => (
                      <option key={entry} value={entry}>{entry}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">마감일 상태</span>
                  <select
                    value={dueFilter}
                    onChange={(event) => setDueFilter(event.target.value as DueFilter)}
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all outline-none"
                  >
                    {DUE_FILTERS.map((entry) => (
                      <option key={entry} value={entry}>{entry === "ALL" ? "전체 기간" : entry === "HAS_DUE" ? "마감일 있음" : entry === "NO_DUE" ? "마감일 없음" : "마감 지남"}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">태그 클라우드</span>
                  {tag && (
                    <button
                      type="button"
                      onClick={() => setTag("")}
                      className="text-[10px] font-black text-emerald-600 hover:underline uppercase tracking-widest"
                    >
                      Filter Reset
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {topTags.length === 0 ? (
                    <span className="text-xs font-bold text-slate-300 italic">등록된 태그가 없습니다.</span>
                  ) : (
                    topTags.map((entry) => {
                      const active = norm(tag) === norm(entry.label);
                      return (
                        <button
                          key={entry.label}
                          type="button"
                          onClick={() => setTag(active ? "" : entry.label)}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-xs font-black transition-all shadow-sm",
                            active
                              ? "bg-emerald-500 text-white border-transparent"
                              : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
                          )}
                        >
                          #{entry.label} <span className={cn("ml-1 tabular-nums opacity-60", active ? "text-white" : "text-slate-400")}>{entry.count}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Mobile Card View */}
          <div className="grid gap-4 lg:hidden">
            {filteredRows.map((item) => (
              <Link key={`mobile-${item.id}`} href={`/feedback/${encodeURIComponent(item.id)}`} className="block group">
                <Card className="rounded-[2rem] p-6 shadow-sm group-hover:border-emerald-200 transition-all active:scale-[0.98]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600 uppercase tracking-wider">{categoryLabel(item.category)}</span>
                      <span className={cn("rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider", statusClassName(item.status))}>{item.status}</span>
                      <span className={cn("rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider", priorityClassName(item.priority))}>{item.priority}</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 tabular-nums">{formatDateTime(item.createdAt).split(" ")[0]}</span>
                  </div>
                  
                  <p className="mt-4 text-sm font-bold text-slate-800 leading-relaxed line-clamp-3">
                    {item.message}
                  </p>
                  
                  <div className="mt-6 flex items-center justify-between border-t border-slate-50 pt-4">
                    <span className="text-[10px] font-bold text-slate-400 font-mono">{item.traceId ?? "-"}</span>
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">상세 보기 ▶</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {/* Desktop Table View */}
          <Card className="hidden lg:block rounded-[2rem] p-8 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <th className="px-4 py-2">카테고리</th>
                    <th className="px-4 py-2">상태</th>
                    <th className="px-4 py-2">우선순위</th>
                    <th className="px-4 py-2">마감일</th>
                    <th className="px-4 py-2">시간</th>
                    <th className="px-4 py-2">메시지</th>
                    <th className="px-4 py-2 text-right">상세</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-transparent">
                  {filteredRows.map((item) => (
                    <tr key={item.id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-4 rounded-l-2xl border-y border-l border-slate-50 bg-white group-hover:bg-slate-50/50 transition-colors font-black text-slate-900">{categoryLabel(item.category)}</td>
                      <td className="px-4 py-4 border-y border-slate-50 bg-white group-hover:bg-slate-50/50 transition-colors">
                        <span className={cn("inline-flex rounded-lg border px-2 py-0.5 text-[10px] font-black tracking-wider", statusClassName(item.status))}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 border-y border-slate-50 bg-white group-hover:bg-slate-50/50 transition-colors">
                        <span className={cn("inline-flex rounded-lg border px-2 py-0.5 text-[10px] font-black tracking-wider", priorityClassName(item.priority))}>
                          {item.priority}
                        </span>
                      </td>
                      <td className="px-4 py-4 border-y border-slate-50 bg-white group-hover:bg-slate-50/50 transition-colors font-bold text-slate-500 tabular-nums text-xs">{dueLabel(item.dueDate)}</td>
                      <td className="px-4 py-4 border-y border-slate-50 bg-white group-hover:bg-slate-50/50 transition-colors font-bold text-slate-400 tabular-nums text-xs whitespace-nowrap">{formatDateTime(item.createdAt)}</td>
                      <td className="px-4 py-4 border-y border-slate-50 bg-white group-hover:bg-slate-50/50 transition-colors font-bold text-slate-700 leading-snug">{summarizeMessage(item.message)}</td>
                      <td className="px-4 py-4 rounded-r-2xl border-y border-r border-slate-50 bg-white group-hover:bg-slate-50/50 transition-colors text-right">
                        <Link href={`/feedback/${encodeURIComponent(item.id)}`} className="text-[11px] font-black text-emerald-600 uppercase tracking-widest hover:underline whitespace-nowrap">
                          Detail ▶
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
