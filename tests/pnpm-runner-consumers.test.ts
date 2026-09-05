import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:child_process")>(), spawn: vi.fn(),
}));

let root: string;
const nodePath = "/fixture node/node.exe";
const jsPath = "/fixture node/node_modules/corepack/dist/pnpm.js";
const installArgs = ["exec", "playwright", "install", "--with-deps", "chromium"];
function child() {
  const value = Object.assign(new EventEmitter(), { pid: 42 });
  vi.mocked(spawn).mockReturnValueOnce(value as unknown as ReturnType<typeof spawn>);
  return value;
}
function setup(platform: string, bundled: boolean) {
  vi.stubGlobal("process", { ...process, platform, execPath: nodePath, exit: vi.fn() });
  const exists = fs.existsSync;
  vi.spyOn(fs, "existsSync").mockImplementation((file) => file === jsPath ? bundled : exists(file));
}
beforeEach(() => {
  vi.resetModules();
  vi.mocked(spawn).mockReset();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pnpm-consumer-"));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fs.rmSync(root, { recursive: true, force: true });
});

describe.each(["win32", "linux"])("direct consumers on %s (mock spawn)", (platform) => {
  it.each([true, false])("connects build worker policy and child exit JSON, bundled=%s", async (bundled) => {
    setup(platform, bundled);
    const logFile = path.join(root, "build.log");
    const exitFile = path.join(root, "exit.json");
    process.argv = [nodePath, "build_detached.mjs", "--worker", `--log-file=${logFile}`, `--exit-file=${exitFile}`];
    const first = child();
    const second = child();
    await import("../scripts/build_detached.mjs");
    const direct = platform === "win32" && bundled;
    const firstCommand = direct ? nodePath : platform === "win32" ? "pnpm.cmd" : "pnpm";
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(spawn).mock.calls[0]).toEqual([
      firstCommand, direct ? [jsPath, "build"] : ["build"],
      { cwd: process.cwd(), env: process.env, shell: platform === "win32" && !direct,
        stdio: ["ignore", expect.any(Number), expect.any(Number)] },
    ]);
    first.emit("error", Object.assign(new Error("fixture missing"), { code: "ENOENT" }));
    first.emit("exit", -2, null);
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(vi.mocked(spawn).mock.calls[1]).toEqual([
      direct ? "pnpm.cmd" : platform === "win32" ? "corepack.cmd" : "corepack",
      direct ? ["build"] : ["pnpm", "build"],
      { cwd: process.cwd(), env: process.env, shell: platform === "win32",
        stdio: ["ignore", expect.any(Number), expect.any(Number)] },
    ]);
    second.emit("exit", 7, null);
    expect(JSON.parse(fs.readFileSync(exitFile, "utf8"))).toMatchObject({ ok: false, code: 7, signal: null, pid: 42, logFile });
    expect(fs.readFileSync(logFile, "utf8")).toContain("worker exit");
    expect(process.exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it.each([true, false])("connects installer policy and ENOENT fallback, bundled=%s", async (bundled) => {
    setup(platform, bundled);
    const { installChromiumWithRetry } = await import("../scripts/playwright_install_chromium.mjs");
    const first = child();
    const second = child();
    const pending = installChromiumWithRetry({ attempts: 1, timeoutMs: 30_000, delayMs: 0 });
    const direct = platform === "win32" && bundled;
    const base = { stdio: "inherit", detached: platform !== "win32", env: process.env, cwd: process.cwd() };
    expect(vi.mocked(spawn).mock.calls[0]).toEqual([
      direct ? nodePath : platform === "win32" ? "pnpm.cmd" : "pnpm",
      direct ? [jsPath, ...installArgs] : installArgs, { ...base, shell: platform === "win32" && !direct },
    ]);
    first.emit("error", Object.assign(new Error("fixture missing"), { code: "ENOENT" }));
    first.emit("close", -2, null);
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
    expect(vi.mocked(spawn).mock.calls[1]).toEqual([
      direct ? "pnpm.cmd" : platform === "win32" ? "corepack.cmd" : "corepack",
      direct ? installArgs : ["pnpm", ...installArgs], { ...base, shell: platform === "win32" },
    ]);
    second.emit("close", 0, null);
    await expect(pending).resolves.toBe(0);
  });
});

it("keeps bounded installer retries distinct from candidate fallback on child nonzero", async () => {
  setup("win32", true);
  const { installChromiumWithRetry } = await import("../scripts/playwright_install_chromium.mjs");
  const first = child();
  const second = child();
  const pending = installChromiumWithRetry({ attempts: 2, timeoutMs: 30_000, delayMs: 0 });
  first.emit("close", 7, null);
  await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
  second.emit("close", 7, null);
  await expect(pending).resolves.toBe(1);
  expect(vi.mocked(spawn).mock.calls.map(([command]) => command)).toEqual([nodePath, nodePath]);
});
