import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AccessibleDialog,
  activateAccessibleDialog,
  dialogTabTarget,
  handleAccessibleDialogKeyDown,
} from "@/components/ui/AccessibleDialog";
import { resetDocumentScrollLockForTest } from "@/lib/browser/scrollLock";

function sourceTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceTsxFiles(absolutePath);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [absolutePath] : [];
  });
}

function fakeClassList() {
  const values = new Set<string>();
  return {
    add: (...tokens: string[]) => tokens.forEach((token) => values.add(token)),
    remove: (...tokens: string[]) => tokens.forEach((token) => values.delete(token)),
    contains: (token: string) => values.has(token),
  };
}

function createDialogTestDocument() {
  let fallbackElement: ReturnType<typeof element> | null = null;
  const fakeDocument = {
    activeElement: null as unknown,
    documentElement: { classList: fakeClassList() },
    body: { classList: fakeClassList() },
    querySelector: () => fallbackElement,
  };

  function element(children: unknown[] = []) {
    const attributes = new Map<string, string>();
    const node = {
      isConnected: true,
      tabIndex: 0,
      focus: () => {
        fakeDocument.activeElement = node;
      },
      contains: (candidate: unknown) => candidate === node || children.includes(candidate),
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) => {
        attributes.set(name, value);
      },
      removeAttribute: (name: string) => {
        attributes.delete(name);
      },
      querySelector: () => children[0] ?? null,
      querySelectorAll: () => children,
    };
    return node;
  }

  return {
    fakeDocument,
    element,
    setFallbackElement: (value: ReturnType<typeof element>) => {
      fallbackElement = value;
    },
  };
}

afterEach(() => {
  resetDocumentScrollLockForTest();
  vi.unstubAllGlobals();
});

describe("accessible dialog contract", () => {
  it("keeps raw modal semantics centralized in AccessibleDialog", () => {
    const sharedDialogPath = path.resolve("src/components/ui/AccessibleDialog.tsx");
    const offenders = sourceTsxFiles(path.resolve("src"))
      .filter((filePath) => filePath !== sharedDialogPath)
      .filter((filePath) => {
        const source = readFileSync(filePath, "utf8");
        return /aria-modal\s*=/.test(source)
          || /role\s*=\s*(?:["']dialog["']|\{\s*["']dialog["']\s*\})/.test(source);
      })
      .map((filePath) => path.relative(process.cwd(), filePath));

    expect(offenders).toEqual([]);
  });

  it("renders a named modal dialog with a focusable panel", () => {
    const markup = renderToStaticMarkup(
      <AccessibleDialog labelledBy="dialog-title" describedBy="dialog-description" onClose={vi.fn()}>
        <h2 id="dialog-title">제목</h2>
        <p id="dialog-description">설명</p>
      </AccessibleDialog>,
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-labelledby="dialog-title"');
    expect(markup).toContain('aria-describedby="dialog-description"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain("items-start");
    expect(markup).toContain("overflow-y-auto");
    expect(markup).toContain("max-h-[calc(100dvh-2rem)]");
    expect(readFileSync(path.resolve("src/components/ui/AccessibleDialog.tsx"), "utf8")).toContain('"summary"');
  });

  it("wraps Tab and Shift+Tab while leaving middle focus unchanged", () => {
    const items = ["first", "middle", "last"];

    expect(dialogTabTarget(items, "last", false)).toBe("first");
    expect(dialogTabTarget(items, "first", true)).toBe("last");
    expect(dialogTabTarget(items, "middle", false)).toBeNull();
    expect(dialogTabTarget(items, null, false)).toBe("first");
    expect(dialogTabTarget(items, null, true)).toBe("last");
  });

  it("closes on Escape and consumes the key event", () => {
    const onClose = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    handleAccessibleDialogKeyDown(
      { key: "Escape", shiftKey: false, preventDefault, stopPropagation },
      {} as HTMLElement,
      onClose,
    );

    expect(onClose).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it("keeps nested dialogs locked and restores focus in LIFO order", () => {
    const { fakeDocument, element } = createDialogTestDocument();
    vi.stubGlobal("document", fakeDocument as unknown as Document);
    const trigger = element();
    const firstFocus = element();
    const firstPanel = element([firstFocus]);
    const secondFocus = element();
    const secondPanel = element([secondFocus]);
    trigger.focus();

    const releaseFirst = activateAccessibleDialog(firstPanel as unknown as HTMLElement);
    const releaseSecond = activateAccessibleDialog(secondPanel as unknown as HTMLElement);

    expect(fakeDocument.activeElement).toBe(secondFocus);
    expect(fakeDocument.body.classList.contains("app-scroll-lock")).toBe(true);

    releaseSecond();
    expect(fakeDocument.activeElement).toBe(firstFocus);
    expect(fakeDocument.body.classList.contains("app-scroll-lock")).toBe(true);

    releaseFirst();
    expect(fakeDocument.activeElement).toBe(trigger);
    expect(fakeDocument.body.classList.contains("app-scroll-lock")).toBe(false);
  });

  it("moves focus to the page fallback when the opening control was removed", () => {
    const { fakeDocument, element, setFallbackElement } = createDialogTestDocument();
    vi.stubGlobal("document", fakeDocument as unknown as Document);
    const trigger = element();
    const fallback = element();
    const firstFocus = element();
    const panel = element([firstFocus]);
    setFallbackElement(fallback);
    trigger.focus();

    const release = activateAccessibleDialog(panel as unknown as HTMLElement);
    trigger.isConnected = false;
    release();

    expect(fakeDocument.activeElement).toBe(fallback);
  });
});
