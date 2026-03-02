"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { uiTextKo } from "@/lib/uiText.ko";

export function HelpDialog() {
  const [open, setOpen] = useState(false);
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const dialog =
    open && isClient
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] overflow-y-auto bg-black/40 p-4"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setOpen(false);
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="help-dialog-title"
              className="mx-auto my-8 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 id="help-dialog-title" className="text-xl font-semibold">
                  {uiTextKo.help.title}
                </h2>
                <button
                  type="button"
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                  onClick={() => setOpen(false)}
                >
                  {uiTextKo.help.close}
                </button>
              </div>

              <p className="mb-5 text-sm text-slate-600">{uiTextKo.help.subtitle}</p>

              <div className="space-y-4 pb-2">
                {uiTextKo.help.sections.map((section) => (
                  <section key={section.title}>
                    <h3 className="font-semibold">{section.title}</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {section.body.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
      >
        {uiTextKo.help.open}
      </button>
      {dialog}
    </>
  );
}
