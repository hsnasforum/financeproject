import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nextHeadersMock = vi.hoisted(() => ({
  headerStore: new Headers(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => nextHeadersMock.headerStore),
}));

import { isDebugEnabled, isDebugPageAccessible } from "../src/lib/dev/debugAccess";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = env.NODE_ENV;
const originalDebugEnabled = env.PLANNING_DEBUG_ENABLED;
const originalAllowRemote = env.ALLOW_REMOTE;
const originalWslInterop = env.WSL_INTEROP;
const originalWslDistroName = env.WSL_DISTRO_NAME;

function setHeaderStore(init: HeadersInit): void {
  nextHeadersMock.headerStore = new Headers(init);
}

describe("debug page access", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
    env.PLANNING_DEBUG_ENABLED = "true";
    delete env.ALLOW_REMOTE;
    delete env.WSL_INTEROP;
    delete env.WSL_DISTRO_NAME;
    setHeaderStore({ host: "localhost:3000" });
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalDebugEnabled === "string") env.PLANNING_DEBUG_ENABLED = originalDebugEnabled;
    else delete env.PLANNING_DEBUG_ENABLED;

    if (typeof originalAllowRemote === "string") env.ALLOW_REMOTE = originalAllowRemote;
    else delete env.ALLOW_REMOTE;

    if (typeof originalWslInterop === "string") env.WSL_INTEROP = originalWslInterop;
    else delete env.WSL_INTEROP;

    if (typeof originalWslDistroName === "string") env.WSL_DISTRO_NAME = originalWslDistroName;
    else delete env.WSL_DISTRO_NAME;
  });

  it("reads debug enabled flag from env", () => {
    env.PLANNING_DEBUG_ENABLED = "false";
    expect(isDebugEnabled()).toBe(false);

    env.PLANNING_DEBUG_ENABLED = "true";
    expect(isDebugEnabled()).toBe(true);
  });

  it("allows localhost host when debug is enabled outside production", async () => {
    setHeaderStore({ host: "localhost:3000" });
    await expect(isDebugPageAccessible()).resolves.toBe(true);
  });

  it("blocks debug pages when forwarded ip is external", async () => {
    setHeaderStore({
      host: "localhost:3000",
      "x-forwarded-for": "203.0.113.9",
    });
    await expect(isDebugPageAccessible()).resolves.toBe(false);
  });

  it("allows WSL bridge ip only in WSL env", async () => {
    setHeaderStore({
      host: "localhost:3000",
      "x-forwarded-for": "172.20.128.1",
    });
    env.WSL_DISTRO_NAME = "Ubuntu";
    await expect(isDebugPageAccessible()).resolves.toBe(true);

    env.WSL_DISTRO_NAME = "";
    env.WSL_INTEROP = "";
    await expect(isDebugPageAccessible()).resolves.toBe(false);
  });

  it("blocks debug pages in production even on localhost", async () => {
    env.NODE_ENV = "production";
    setHeaderStore({ host: "localhost:3000" });
    await expect(isDebugPageAccessible()).resolves.toBe(false);
  });
});
