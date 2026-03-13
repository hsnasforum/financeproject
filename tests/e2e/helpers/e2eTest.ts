import { expect, test as base } from "@playwright/test";

const shouldDisableDevHmr = (
  (process.env.E2E_DISABLE_DEV_HMR ?? "1") !== "0"
  && (process.env.E2E_WEB_SERVER_MODE ?? "development").trim().toLowerCase() !== "production"
);

const test = base.extend({
  page: async ({ page }, runPage) => {
    if (shouldDisableDevHmr) {
      await page.addInitScript(() => {
        const windowWithGuard = window as typeof window & {
          __E2E_DEV_HMR_GUARD__?: boolean;
          WebSocket: typeof WebSocket;
        };
        if (windowWithGuard.__E2E_DEV_HMR_GUARD__) return;
        windowWithGuard.__E2E_DEV_HMR_GUARD__ = true;

        const NativeWebSocket = windowWithGuard.WebSocket;
        if (typeof NativeWebSocket !== "function") return;

        const HMR_PATH = "/_next/webpack-hmr";

        class MockHmrWebSocket extends EventTarget {
          static CONNECTING = NativeWebSocket.CONNECTING;
          static OPEN = NativeWebSocket.OPEN;
          static CLOSING = NativeWebSocket.CLOSING;
          static CLOSED = NativeWebSocket.CLOSED;

          CONNECTING = NativeWebSocket.CONNECTING;
          OPEN = NativeWebSocket.OPEN;
          CLOSING = NativeWebSocket.CLOSING;
          CLOSED = NativeWebSocket.CLOSED;
          binaryType: BinaryType = "blob";
          bufferedAmount = 0;
          extensions = "";
          protocol = "";
          readyState: number = NativeWebSocket.CONNECTING;
          url: string;
          onclose: ((event: CloseEvent) => void) | null = null;
          onerror: ((event: Event) => void) | null = null;
          onmessage: ((event: MessageEvent) => void) | null = null;
          onopen: ((event: Event) => void) | null = null;

          constructor(rawUrl: string) {
            super();
            this.url = rawUrl;
            queueMicrotask(() => {
              if (this.readyState !== NativeWebSocket.CONNECTING) return;
              this.readyState = NativeWebSocket.OPEN;
              const event = new Event("open");
              this.dispatchEvent(event);
              this.onopen?.(event);
            });
          }

          send(_data?: string | ArrayBufferLike | Blob | ArrayBufferView) {
            void _data;
            return undefined;
          }

          close(code = 1000, reason = "") {
            if (this.readyState === NativeWebSocket.CLOSED) return;
            this.readyState = NativeWebSocket.CLOSED;
            const event = new CloseEvent("close", { code, reason, wasClean: true });
            this.dispatchEvent(event);
            this.onclose?.(event);
          }
        }

        const GuardedWebSocket = function guardedWebSocket(
          url: string | URL,
          protocols?: string | string[],
        ) {
          const rawUrl = typeof url === "string" ? url : url.toString();
          if (rawUrl.includes(HMR_PATH)) {
            return new MockHmrWebSocket(rawUrl) as unknown as WebSocket;
          }
          if (protocols === undefined) return new NativeWebSocket(url);
          return new NativeWebSocket(url, protocols);
        } as unknown as typeof WebSocket;

        Object.defineProperties(GuardedWebSocket, {
          CONNECTING: { value: NativeWebSocket.CONNECTING },
          OPEN: { value: NativeWebSocket.OPEN },
          CLOSING: { value: NativeWebSocket.CLOSING },
          CLOSED: { value: NativeWebSocket.CLOSED },
        });
        GuardedWebSocket.prototype = NativeWebSocket.prototype;

        Object.defineProperty(windowWithGuard, "WebSocket", {
          configurable: true,
          writable: true,
          value: GuardedWebSocket,
        });
      });
    }

    await runPage(page);
  },
});

export { expect, test };
export type { Page } from "@playwright/test";
