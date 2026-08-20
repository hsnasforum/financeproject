"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { uiTextKo } from "@/lib/uiText.ko";

export function HelpDialog() {
  const [open, setOpen] = useState(false);
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const dialog =
    open && isClient
      ? createPortal(
          <AccessibleDialog
            labelledBy="help-dialog-title"
            onClose={() => setOpen(false)}
            overlayClassName="z-[100] overflow-y-auto bg-black/40 p-4"
            panelClassName="mx-auto my-8 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
                <h2 id="help-dialog-title" className="text-xl font-semibold">
                  {uiTextKo.help.title}
                </h2>
                <button
                  type="button"
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-surface-muted"
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
          </AccessibleDialog>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-surface-muted"
      >
        {uiTextKo.help.open}
      </button>
      {dialog}
    </>
  );
}
