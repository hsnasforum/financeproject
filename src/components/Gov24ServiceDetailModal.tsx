"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { dedupeConsecutiveLines } from "@/lib/gov24/detailLines";
import { type EligibilityItem } from "@/lib/gov24/eligibilityNormalize";
import { safeExternalUrl } from "@/lib/url/safeExternalUrl";
import { type ApplyLink } from "@/lib/gov24/applyLinks";

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
    <div className="fixed inset-0 z-50 bg-black/30 p-4" onClick={onClose}>
      <div className="mx-auto mt-10 max-w-3xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{data.title}</h3>
            <p className="mt-1 text-xs text-slate-500">상세 데이터: {SOURCE_LABEL[data.source]}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>닫기</Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
            <Button key={key} size="sm" variant={tab === key ? "primary" : "outline"} onClick={() => setTab(key)}>
              {TAB_LABELS[key]}
            </Button>
          ))}
        </div>

        <div className="mt-3 rounded-xl border border-border p-3">
          {tab === "target" ? (
            targetItems.length > 0 ? (
              <div className="space-y-3">
                <ul className="space-y-1 text-sm text-slate-700">
                  {targetItems.map((entry, idx) => (
                    <li key={`${idx}:${entry.key}`} className="list-disc ml-5">
                      <span className="font-semibold">{entry.key}:</span> {entry.value}
                    </li>
                  ))}
                </ul>
                {targetRaw.length > 0 ? (
                  <details className="text-xs text-slate-600">
                    <summary className="cursor-pointer select-none">원문 전체 보기</summary>
                    <ul className="mt-2 space-y-1">
                      {targetRaw.map((line, idx) => (
                        <li key={`${idx}:${line.length}:${line.slice(0, 32)}`} className="list-disc ml-4">{line}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            ) : targetRaw.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-600">요약 불가(원문 제공)</p>
                <ul className="space-y-1 text-sm text-slate-700">
                  {targetRaw.map((line, idx) => (
                    <li key={`${idx}:${line.length}:${line.slice(0, 32)}`} className="list-disc ml-5">{line}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-slate-500">원본 제공 없음</p>
            )
          ) : lines.length > 0 ? (
            <div className="space-y-3">
              <ul className="space-y-1 text-sm text-slate-700">
                {lines.map((line, idx) => (
                  <li key={`${idx}:${line.length}:${line.slice(0, 32)}`} className="list-disc ml-5">{line}</li>
                ))}
              </ul>
              {tab === "apply" && applyLinks.length > 0 ? (
                <div>
                  <div className="flex flex-wrap gap-2">
                    {applyLinks.map((entry, idx) => (
                      <a
                        key={`${idx}:${entry.url}`}
                        className="inline-flex h-9 items-center rounded-xl border border-border px-3 text-sm font-medium"
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {entry.label || "바로가기"}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : tab === "apply" && applyLinks.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-500">신청방법 원문이 없습니다.</p>
              <div className="flex flex-wrap gap-2">
                {applyLinks.map((entry, idx) => (
                  <a
                    key={`${idx}:${entry.url}`}
                    className="inline-flex h-9 items-center rounded-xl border border-border px-3 text-sm font-medium"
                  href={entry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                    {entry.label || "바로가기"}
                </a>
              ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">원본 제공 없음</p>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
          {data.org ? <span>접수기관: {data.org}</span> : null}
          {data.contact ? <span>전화문의: {data.contact}</span> : null}
          {data.applyHow ? <span>신청방법: {data.applyHow}</span> : null}
        </div>
        {safeApplyUrl ? (
          <div className="mt-3">
            <a className="inline-flex h-9 items-center rounded-xl border border-border px-3 text-sm" href={safeApplyUrl} target="_blank" rel="noopener noreferrer">
              타사이트 이동
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
