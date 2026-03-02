"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { playbooks } from "@/lib/planner/playbook.ko";

type PlaybookModalProps = {
  open: boolean;
  onClose: () => void;
  playbookId: string | null;
};

export function PlaybookModal({ open, onClose, playbookId }: PlaybookModalProps) {
  const playbook = playbookId ? playbooks[playbookId] : null;

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

  if (!open || typeof document === "undefined" || !playbook) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[115] overflow-y-auto bg-black/45 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="playbook-title" className="mx-auto my-8 w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="playbook-title" className="text-xl font-semibold">{playbook.title}</h2>
          <button type="button" className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="space-y-4 text-sm">
          <section>
            <p className="font-medium">이런 경우에 유용</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
              {playbook.whoFor.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </section>

          <section>
            <p className="font-medium">단계별 방법</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-slate-700">
              {playbook.steps.map((line) => <li key={line}>{line}</li>)}
            </ol>
          </section>

          {playbook.tips?.length ? (
            <section>
              <p className="font-medium">팁</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
                {playbook.tips.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </section>
          ) : null}

          {playbook.pitfalls?.length ? (
            <section>
              <p className="font-medium">주의사항</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
                {playbook.pitfalls.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </section>
          ) : null}

          {playbook.relatedLinks?.length ? (
            <section>
              <p className="font-medium">관련 페이지</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {playbook.relatedLinks.map((link) => (
                  <a key={link.href + link.label} href={link.href} target="_blank" rel="noopener noreferrer" className="rounded border px-3 py-1.5 text-xs hover:bg-slate-50">
                    {link.label}
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
