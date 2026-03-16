"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { dedupeConsecutiveLines } from "@/lib/gov24/detailLines";
import { type EligibilityItem } from "@/lib/gov24/eligibilityNormalize";
import { safeExternalUrl } from "@/lib/url/safeExternalUrl";
import { type ApplyLink } from "@/lib/gov24/applyLinks";
import { cn } from "@/lib/utils";

export type Gov24ServiceDetailData = {
  id: string;
  title: string;
  org?: string;
  applyHow?: string;
  contact?: string;
  link?: string;
  source: "official" | "openapi" | "fallback";
  tabs: {
    overview: string[];
    target: string[];
    benefit: string[];
    apply: string[];
    contact: string[];
  };
  supportTarget?: {
    items: EligibilityItem[];
    raw: string[];
  };
  applyLinks?: ApplyLink[];
  primaryApplyUrl?: string | null;
};

type TabKey = "overview" | "target" | "benefit" | "apply" | "contact";

const TAB_LABELS: Record<TabKey, string> = {
  overview: "주요내용",
  target: "지원대상",
  benefit: "지원내용",
  apply: "신청방법",
  contact: "접수·문의",
};

const SOURCE_LABEL: Record<Gov24ServiceDetailData["source"], string> = {
  official: "공식 연동",
  openapi: "오픈API",
  fallback: "Fallback",
};

export function Gov24ServiceDetailModal({ data, onClose }: { data: Gov24ServiceDetailData; onClose: () => void }) {
  const [tab, setTab] = useState<TabKey>("overview");
  const lines = useMemo(() => dedupeConsecutiveLines(data.tabs[tab] ?? []), [data.tabs, tab]);
  const targetItems = useMemo(() => data.supportTarget?.items ?? [], [data.supportTarget?.items]);
  const applyLinks = useMemo(() => {
    const rows = Array.isArray(data.applyLinks) ? data.applyLinks : [];
    const deduped: ApplyLink[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const safe = safeExternalUrl(row.url);
      if (!safe || seen.has(safe)) continue;
      seen.add(safe);
      deduped.push({ label: row.label?.trim() || "온라인신청", url: safe });
    }
    return deduped;
  }, [data.applyLinks]);
  const safeApplyUrl = useMemo(() => safeExternalUrl(data.link), [data.link]);
  const targetRaw = useMemo(
    () => dedupeConsecutiveLines(data.supportTarget?.raw ?? data.tabs.target ?? []),
    [data.supportTarget?.raw, data.tabs.target],
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm p-4 flex items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-[2.5rem] bg-white p-8 lg:p-10 shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">맞춤 혜택 상세 정보</span>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">{data.title}</h3>
            <div className="flex items-center gap-3 pt-1">
              <span className="inline-flex rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500 uppercase tracking-wider">Source: {SOURCE_LABEL[data.source]}</span>
              {data.org && <span className="text-[11px] font-bold text-slate-400">기관: {data.org}</span>}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-2xl bg-slate-100 p-2 text-slate-400 hover:bg-slate-200 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <div className="mt-8 flex flex-wrap gap-1.5 border-b border-slate-100 pb-4">
          {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "rounded-full px-4 py-2 text-xs font-black transition-all",
                tab === key
                  ? "bg-emerald-500 text-white shadow-md shadow-emerald-200"
                  : "bg-white text-slate-500 hover:bg-slate-50"
              )}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === "target" ? (
            targetItems.length > 0 ? (
              <div className="space-y-6">
                <ul className="grid gap-3">
                  {targetItems.map((entry, idx) => (
                    <li key={`${idx}:${entry.key}`} className="rounded-2xl bg-slate-50 p-4 border border-slate-100/50">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{entry.key}</p>
                      <p className="text-sm font-bold text-slate-700 leading-relaxed">{entry.value}</p>
                    </li>
                  ))}
                </ul>
                {targetRaw.length > 0 ? (
                  <details className="group rounded-2xl border border-slate-100 p-2">
                    <summary className="cursor-pointer select-none px-2 py-1 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors list-none flex items-center justify-between">
                      <span>원문 전체 보기</span>
                      <span className="group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <div className="mt-4 px-2 pb-2">
                      <ul className="space-y-2">
                        {targetRaw.map((line, idx) => (
                          <li key={`${idx}:${line.length}:${line.slice(0, 32)}`} className="text-xs font-medium text-slate-500 leading-relaxed list-disc ml-4">{line}</li>
                        ))}
                      </ul>
                    </div>
                  </details>
                ) : null}
              </div>
            ) : targetRaw.length > 0 ? (
              <div className="space-y-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">지원 대상 원문</p>
                <ul className="space-y-2.5">
                  {targetRaw.map((line, idx) => (
                    <li key={`${idx}:${line.length}:${line.slice(0, 32)}`} className="text-sm font-medium text-slate-600 leading-relaxed list-disc ml-5">{line}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="py-12 text-center rounded-3xl border border-dashed border-slate-200">
                <p className="text-sm font-black text-slate-300">원본 제공 정보가 없습니다.</p>
              </div>
            )
          ) : lines.length > 0 ? (
            <div className="space-y-6">
              <ul className="space-y-3">
                {lines.map((line, idx) => (
                  <li key={`${idx}:${line.length}:${line.slice(0, 32)}`} className="text-sm font-medium text-slate-700 leading-relaxed list-disc ml-5">{line}</li>
                ))}
              </ul>
              {tab === "apply" && applyLinks.length > 0 ? (
                <div className="pt-6 border-t border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">온라인 신청 바로가기</p>
                  <div className="flex flex-wrap gap-2">
                    {applyLinks.map((entry, idx) => (
                      <a
                        key={`${idx}:${entry.url}`}
                        className="inline-flex h-11 items-center rounded-2xl border border-slate-200 bg-white px-6 text-sm font-black text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98]"
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {entry.label || "신청하기"}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : tab === "apply" && applyLinks.length > 0 ? (
            <div className="space-y-6">
              <div className="py-8 text-center rounded-3xl bg-slate-50">
                <p className="text-sm font-black text-slate-400">신청방법 원문이 없습니다.</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">제공된 신청 링크</p>
                <div className="flex flex-wrap gap-2">
                  {applyLinks.map((entry, idx) => (
                    <a
                      key={`${idx}:${entry.url}`}
                      className="inline-flex h-11 items-center rounded-2xl border border-slate-200 bg-white px-6 text-sm font-black text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98]"
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {entry.label || "신청하기"}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center rounded-3xl border border-dashed border-slate-200">
              <p className="text-sm font-black text-slate-300">원본 제공 정보가 없습니다.</p>
            </div>
          )}
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 border-t border-slate-100 pt-8">
          {data.contact && (
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">전화 문의</p>
              <p className="text-sm font-black text-slate-700">{data.contact}</p>
            </div>
          )}
          {data.applyHow && (
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">신청 방법</p>
              <p className="text-sm font-black text-slate-700">{data.applyHow}</p>
            </div>
          )}
          {safeApplyUrl && (
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">관련 사이트</p>
              <a className="text-sm font-black text-emerald-600 underline underline-offset-4 decoration-emerald-200 hover:text-emerald-700 transition-colors" href={safeApplyUrl} target="_blank" rel="noopener noreferrer">
                정부24에서 확인하기
              </a>
            </div>
          )}
        </div>

        <div className="mt-10 flex justify-center">
          <Button variant="outline" className="rounded-2xl h-12 px-12 font-black" onClick={onClose}>
            창 닫기
          </Button>
        </div>
      </div>
    </div>
  );
}
