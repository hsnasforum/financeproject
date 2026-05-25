import { afterEach, describe, expect, it, vi } from "vitest";
import { lockDocumentScroll, resetDocumentScrollLockForTest } from "../src/lib/browser/scrollLock";

function createFakeClassList() {
  const tokens = new Set<string>();
  return {
    add: (...values: string[]) => {
      values.forEach((value) => tokens.add(value));
    },
    remove: (...values: string[]) => {
      values.forEach((value) => tokens.delete(value));
    },
    contains: (value: string) => tokens.has(value),
  };
}

function createFakeDocument() {
  return {
    documentElement: { classList: createFakeClassList() },
    body: { classList: createFakeClassList() },
  } as unknown as Document;
}

afterEach(() => {
  resetDocumentScrollLockForTest();
  vi.unstubAllGlobals();
});

describe("lockDocumentScroll", () => {
  it("keeps the scroll lock class until the last release", () => {
    const fakeDocument = createFakeDocument();
    vi.stubGlobal("document", fakeDocument);

    const releaseFirst = lockDocumentScroll();
    const releaseSecond = lockDocumentScroll();

    expect(fakeDocument.documentElement.classList.contains("app-scroll-lock")).toBe(true);
    expect(fakeDocument.body.classList.contains("app-scroll-lock")).toBe(true);

    releaseFirst();
    expect(fakeDocument.documentElement.classList.contains("app-scroll-lock")).toBe(true);
    expect(fakeDocument.body.classList.contains("app-scroll-lock")).toBe(true);

    releaseSecond();
    expect(fakeDocument.documentElement.classList.contains("app-scroll-lock")).toBe(false);
    expect(fakeDocument.body.classList.contains("app-scroll-lock")).toBe(false);
  });
});
