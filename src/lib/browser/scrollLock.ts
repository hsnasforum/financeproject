const SCROLL_LOCK_CLASSNAME = "app-scroll-lock";

let scrollLockCount = 0;

function applyScrollLock(enabled: boolean): void {
  if (typeof document === "undefined") return;
  const method = enabled ? "add" : "remove";
  document.documentElement.classList[method](SCROLL_LOCK_CLASSNAME);
  document.body.classList[method](SCROLL_LOCK_CLASSNAME);
}

export function lockDocumentScroll(): () => void {
  if (typeof document === "undefined") {
    return () => undefined;
  }

  scrollLockCount += 1;
  applyScrollLock(true);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) {
      applyScrollLock(false);
    }
  };
}

export function resetDocumentScrollLockForTest(): void {
  scrollLockCount = 0;
  applyScrollLock(false);
}
