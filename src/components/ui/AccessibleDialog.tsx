"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { lockDocumentScroll } from "@/lib/browser/scrollLock";
import { cn } from "@/lib/utils";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "summary",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableElements(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
    .filter((element) => element.tabIndex >= 0 && element.getAttribute("aria-hidden") !== "true");
}

function activeHTMLElement(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const active = document.activeElement;
  return active && typeof (active as HTMLElement).focus === "function"
    ? active as HTMLElement
    : null;
}

function focusDialogFallback(): void {
  if (typeof document === "undefined") return;
  const fallback = document.querySelector<HTMLElement>(
    "[data-dialog-focus-fallback], main, [role='main'], h1",
  );
  if (!fallback) return;

  const previousTabIndex = fallback.getAttribute("tabindex");
  if (fallback.tabIndex < 0) fallback.setAttribute("tabindex", "-1");
  fallback.focus();
  if (previousTabIndex === null) fallback.removeAttribute("tabindex");
  else fallback.setAttribute("tabindex", previousTabIndex);
}

export function dialogTabTarget<T>(items: T[], active: T | null, shiftKey: boolean): T | null {
  if (items.length === 0) return null;
  const index = active === null ? -1 : items.indexOf(active);
  if (index < 0) return shiftKey ? (items[items.length - 1] ?? null) : (items[0] ?? null);
  if (shiftKey && index === 0) return items[items.length - 1] ?? null;
  if (!shiftKey && index === items.length - 1) return items[0] ?? null;
  return null;
}

export function activateAccessibleDialog(panel: HTMLElement): () => void {
  if (typeof document === "undefined") return () => undefined;

  const previouslyFocused = activeHTMLElement();
  const releaseScrollLock = lockDocumentScroll();
  const initialFocus = panel.querySelector<HTMLElement>("[data-dialog-initial-focus]")
    ?? focusableElements(panel)[0]
    ?? panel;
  initialFocus.focus();

  return () => {
    releaseScrollLock();
    if (!previouslyFocused?.isConnected) {
      focusDialogFallback();
      return;
    }

    const active = activeHTMLElement();
    const focusBelongsToClosingDialog = active === null
      || active === document.body
      || !active.isConnected
      || panel.contains(active);
    if (focusBelongsToClosingDialog) {
      previouslyFocused.focus();
      if (activeHTMLElement() !== previouslyFocused) focusDialogFallback();
    }
  };
}

export function handleAccessibleDialogKeyDown(
  event: Pick<KeyboardEvent<HTMLDivElement>, "key" | "shiftKey" | "preventDefault" | "stopPropagation">,
  panel: HTMLElement,
  onClose: () => void,
): void {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    onClose();
    return;
  }
  if (event.key !== "Tab") return;

  const focusable = focusableElements(panel);
  if (focusable.length === 0) {
    event.preventDefault();
    panel.focus();
    return;
  }

  const active = activeHTMLElement();
  const target = dialogTabTarget(
    focusable,
    active && panel.contains(active) ? active : null,
    event.shiftKey,
  );
  if (target) {
    event.preventDefault();
    target.focus();
  }
}

export function AccessibleDialog({
  children,
  labelledBy,
  describedBy,
  onClose,
  closeOnOverlay = true,
  testId,
  overlayClassName,
  panelClassName,
}: {
  children: ReactNode;
  labelledBy: string;
  describedBy?: string;
  onClose: () => void;
  closeOnOverlay?: boolean;
  testId?: string;
  overlayClassName?: string;
  panelClassName?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    return activateAccessibleDialog(panel);
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const panel = panelRef.current;
    if (!panel) return;
    handleAccessibleDialogKeyDown(event, panel, closeRef.current);
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center",
        overlayClassName,
      )}
      onMouseDown={(event) => {
        if (closeOnOverlay && event.target === event.currentTarget) closeRef.current();
      }}
    >
      <div
        ref={panelRef}
        data-testid={testId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={cn("max-h-[calc(100dvh-2rem)] overflow-y-auto outline-none", panelClassName)}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </div>
  );
}
