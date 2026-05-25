"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type EvidenceItem } from "@/lib/planning/v2/insights/evidence";
import { formatEvidenceInput } from "./shared";

export function CoreMetricEvidenceDock({ item }: { item?: EvidenceItem }) {
  const evidenceItem = item ?? null;
  const itemId = evidenceItem?.id ?? "none";
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!evidenceItem) return null;

  return (
    <div className="mt-3">
      <button
        data-testid={`core-metric-evidence-toggle-${itemId}`}
        onClick={() => setOpen((prev) => !prev)}
        ref={triggerRef}
        type="button"
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-all hover:border-primary/20 hover:text-primary shadow-sm"
      >
        <span>근거 {open ? "닫기" : "보기"}</span>
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
          <div
            className="fixed inset-0 z-[120] overflow-y-auto bg-slate-950/35 px-3 py-6 backdrop-blur-sm sm:px-4 sm:py-8"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setOpen(false);
              }
            }}
          >
            <div
              data-testid={`core-metric-evidence-panel-${itemId}`}
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`core-metric-evidence-title-${itemId}`}
              className="mx-auto w-full max-w-[920px] rounded-[2rem] border border-slate-200 bg-white/95 p-6 shadow-2xl backdrop-blur-md sm:p-7"
            >
              <div className="space-y-4">
                <div className="rounded-2xl border border-primary/10 bg-primary/30 px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary">계산 공식</p>
                  <p id={`core-metric-evidence-title-${itemId}`} className="mt-1 text-xs font-bold leading-relaxed text-slate-700">{evidenceItem.formula}</p>
                </div>

                <div>
                  <p className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">입력값</p>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {evidenceItem.inputs.map((input, index) => (
                      <li className="rounded-xl border border-slate-100 bg-surface-muted px-3 py-2" key={`${itemId}:input:${index}`}>
                        <p className="text-[10px] font-bold text-slate-400">{input.label}</p>
                        <p className="mt-0.5 text-xs font-black text-navy tabular-nums">{formatEvidenceInput(input.value)}</p>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 bg-surface-muted px-4 py-3">
                    <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">가정</p>
                    {evidenceItem.assumptions.length > 0 ? (
                      <ul className="list-disc space-y-1 pl-4 text-xs font-bold text-slate-600">
                        {evidenceItem.assumptions.map((assumption, index) => (
                          <li key={`${itemId}:assumption:${index}`}>{assumption}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs font-bold italic text-slate-300">가정 정보 없음</p>
                    )}
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-surface-muted px-4 py-3">
                    <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">참고 메모</p>
                    {evidenceItem.notes && evidenceItem.notes.length > 0 ? (
                      <ul className="list-disc space-y-1 pl-4 text-xs font-bold text-slate-600">
                        {evidenceItem.notes.map((note, index) => (
                          <li key={`${itemId}:note:${index}`}>{note}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs font-bold italic text-slate-300">추가 참고 없음</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}
