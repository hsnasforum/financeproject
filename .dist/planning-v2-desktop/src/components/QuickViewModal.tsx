"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { type NormalizedProduct } from "@/lib/finlife/types";
import { parseFinlifeApiResponse } from "@/lib/finlife/apiSchema";

export type QuickViewKind = "deposit" | "saving" | "recommend" | "products" | "fxtool" | "benefits" | "subscription";

type FinlifeApiResponse = {
  ok: boolean;
  mode: "mock" | "live";
  data: NormalizedProduct[];
  meta?: { message?: string };
};

type QuickViewModalProps = {
  open: boolean;
  onClose: () => void;
  kind: QuickViewKind;
  title: string;
  hrefForNewTab: string;
};

function ProductPreview({ kind }: { kind: "deposit" | "saving" }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [mode, setMode] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [items, setItems] = useState<NormalizedProduct[]>([]);

  useEffect(() => {
    let aborted = false;

    async function run() {
      setLoading(true);
      setError("");

      try {
        const res = await fetch(`/api/finlife/${kind}?topFinGrpNo=020000&pageNo=1`, { cache: "no-store" });
        const json = parseFinlifeApiResponse(await res.json()) as FinlifeApiResponse;
        if (aborted) return;

        if (!json.ok) {
          setError("데이터를 불러오지 못했습니다.");
          return;
        }

        setItems((json.data ?? []).slice(0, 8));
        setMode(json.mode);
        setMessage(json.meta?.message ?? "");
      } catch {
        if (aborted) return;
        setError("데이터를 불러오지 못했습니다.");
      } finally {
        if (!aborted) setLoading(false);
      }
    }

    run();
    return () => {
      aborted = true;
    };
  }, [kind]);

  if (loading) return <p className="text-sm text-slate-600">요약 데이터를 불러오는 중...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">데이터 모드: <b>{mode || "-"}</b>{message ? ` · ${message}` : ""}</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.fin_prdt_cd} className="rounded border p-3">
            <p className="text-sm font-semibold">{item.fin_prdt_nm ?? "상품명 없음"}</p>
            <p className="text-xs text-slate-600">{item.kor_co_nm ?? "금융사 정보 없음"}</p>
            <p className="mt-1 text-xs">
              대표 옵션: {item.best?.save_trm ?? "-"}개월 · 최고금리 {item.best?.intr_rate2 ?? "-"}%
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function QuickViewModal({ open, onClose, kind, title, hrefForNewTab }: QuickViewModalProps) {
  const [productsTab, setProductsTab] = useState<"deposit" | "saving">("deposit");

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  const body = useMemo(() => {
    if (kind === "recommend") {
      return (
        <div className="rounded border bg-slate-50 p-3 text-sm text-slate-700">
          추천 페이지에서 필터/점수 근거를 더 자세히 확인할 수 있습니다.
        </div>
      );
    }

    if (kind === "fxtool") {
      return (
        <div className="space-y-2">
          <p className="text-sm text-slate-700">환율 도구를 현재 화면에서 바로 확인할 수 있습니다.</p>
          <iframe title="환율 도구 미리보기" src="/tools/fx" className="h-[420px] w-full rounded border" />
        </div>
      );
    }

    if (kind === "benefits") {
      return (
        <div className="space-y-2">
          <p className="text-sm text-slate-700">혜택 후보를 빠르게 확인할 수 있습니다.</p>
          <iframe title="혜택 후보 미리보기" src={hrefForNewTab} className="h-[420px] w-full rounded border" />
        </div>
      );
    }

    if (kind === "subscription") {
      return (
        <div className="space-y-2">
          <p className="text-sm text-slate-700">청약/분양 일정을 빠르게 확인할 수 있습니다.</p>
          <iframe title="청약 일정 미리보기" src={hrefForNewTab} className="h-[420px] w-full rounded border" />
        </div>
      );
    }

    if (kind === "products") {
      return (
        <div>
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              className={`rounded border px-3 py-1.5 text-sm ${productsTab === "deposit" ? "bg-slate-900 text-white" : "bg-white"}`}
              onClick={() => setProductsTab("deposit")}
            >
              예금
            </button>
            <button
              type="button"
              className={`rounded border px-3 py-1.5 text-sm ${productsTab === "saving" ? "bg-slate-900 text-white" : "bg-white"}`}
              onClick={() => setProductsTab("saving")}
            >
              적금
            </button>
          </div>
          <ProductPreview kind={productsTab} />
        </div>
      );
    }

    return <ProductPreview kind={kind} />;
  }, [kind, productsTab, hrefForNewTab]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] overflow-y-auto bg-black/45 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="quickview-title" className="mx-auto my-8 w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="quickview-title" className="text-xl font-semibold">{title}</h2>
          <button type="button" className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50" onClick={onClose}>
            닫기
          </button>
        </div>

        {body}

        <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
          <a
            className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
            href={hrefForNewTab}
            target="_blank"
            rel="noopener noreferrer"
          >
            전체 페이지 새 탭으로 열기
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}
