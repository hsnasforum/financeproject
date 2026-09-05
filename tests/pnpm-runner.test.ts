import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pnpmCommandCandidates, pnpmSpawnOptions, runPnpm, runPnpmBuffered, runPnpmSync, startPnpm } from "../scripts/pnpm_runner.mjs";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: vi.fn(), spawnSync: vi.fn() };
});

const windowsNode = "C:\\Node Runtime\\node.exe";
const windowsCorepack = "C:\\Node Runtime\\node_modules\\corepack\\dist\\pnpm.js";
const roots: string[] = [];
const commandError = (code: string) => Object.assign(new Error("fixture " + code), { code });
function syncResult(overrides: Record<string, unknown> = {}) {
  return {
    pid: 17, output: [null, "output\n", "error\n"], stdout: "output\n", stderr: "error\n",
    status: 0, signal: null, ...overrides,
  } as ReturnType<typeof spawnSync>;
}
function queueChild() {
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
  vi.mocked(spawn).mockReturnValueOnce(child as unknown as ReturnType<typeof spawn>);
  return child;
}
function simulateWindows() {
  // Mocked Windows process/path semantics are not a native cmd.exe execution.
  vi.stubGlobal("process", { ...process, platform: "win32", execPath: windowsNode });
  vi.spyOn(path, "dirname").mockImplementation(path.win32.dirname);
  vi.spyOn(path, "join").mockImplementation(path.win32.join);
  return vi.spyOn(fs, "existsSync").mockReturnValue(true);
}
beforeEach(() => {
  vi.mocked(spawn).mockReset();
  vi.mocked(spawnSync).mockReset();
  vi.stubGlobal("process", { ...process, platform: "linux" });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("pnpm runner candidates", () => {
  it("keeps POSIX pnpm/corepack order without checking bundled Corepack", () => {
    const pathExists = vi.fn();
    expect(pnpmCommandCandidates("linux", { pathExists })).toEqual([
      { command: "pnpm", args: [] }, { command: "corepack", args: ["pnpm"] },
    ]);
    expect(pathExists).not.toHaveBeenCalled();
  });
  it.each([true, false])("selects Windows space paths with bundled entry present=%s", (present) => {
    const pathExists = vi.fn(() => present);
    expect(pnpmCommandCandidates("win32", {
      execPath: windowsNode, corepackPnpmPath: windowsCorepack, pathExists,
    })).toEqual([
      ...(present ? [{ command: windowsNode, args: [windowsCorepack], execution: "windows-node-js" }] : []),
      { command: "pnpm.cmd", args: [] }, { command: "corepack.cmd", args: ["pnpm"] },
    ]);
    expect(pathExists).toHaveBeenCalledExactlyOnceWith(windowsCorepack);
  });
  it("computes the default bundled path from the actual host executable without path injection", () => {
    const executable = process.execPath;
    const expected = path.join(path.dirname(executable), "node_modules", "corepack", "dist", "pnpm.js");
    const exists = vi.spyOn(fs, "existsSync").mockReturnValue(true);
    expect(pnpmCommandCandidates("win32")[0]).toEqual({ command: executable, args: [expected], execution: "windows-node-js" });
    expect(exists).toHaveBeenCalledExactlyOnceWith(expected);
  });
  it("computes default Windows paths under simulated native path semantics", () => {
    const exists = simulateWindows();
    expect(pnpmCommandCandidates()).toEqual([
      { command: windowsNode, args: [windowsCorepack], execution: "windows-node-js" },
      { command: "pnpm.cmd", args: [] }, { command: "corepack.cmd", args: ["pnpm"] },
    ]);
    expect(exists).toHaveBeenCalledExactlyOnceWith(windowsCorepack);
  });
});

describe("candidate execution policy", () => {
  it.each([undefined, true, false, "cmd.exe"])("changes only bundled shell with requested shell=%s", (shell) => {
    simulateWindows();
    const options = Object.freeze({
      ...(shell === undefined ? {} : { shell }), cwd: "C:\\Trial Dir", env: Object.freeze({ B2: "yes" }),
      encoding: "utf8", stdio: "pipe", windowsHide: true, detached: false, timeout: 500,
      signal: new AbortController().signal,
    });
    const candidates = [...pnpmCommandCandidates(), ...pnpmCommandCandidates("linux"),
      { command: "C:\\arbitrary node.exe", args: ["arbitrary.js"] }];
    candidates.forEach((candidate, index) => {
      Object.freeze(candidate.args);
      Object.freeze(candidate);
      const effective = pnpmSpawnOptions(candidate, options);
      expect(effective).toEqual(index === 0 ? { ...options, shell: false } : options);
      expect(effective).not.toBe(options);
      expect(effective).not.toHaveProperty("execution");
      expect(effective).not.toHaveProperty("windowsVerbatimArguments");
    });
    expect(options.shell).toBe(shell);
  });

  it("recomputes sync fallback options from the frozen caller options", () => {
    simulateWindows();
    const options = Object.freeze({ shell: true, encoding: "utf8", windowsHide: true });
    const expected = syncResult({ status: 7 });
    const runner = vi.fn()
      .mockReturnValueOnce(syncResult({ error: commandError("ENOENT") }))
      .mockReturnValueOnce(syncResult({ error: commandError("ENOENT") }))
      .mockReturnValueOnce(expected);
    const args = Object.freeze(["two words", ""]);
    expect(runPnpmSync(args, options, runner)).toBe(expected);
    expect(runner.mock.calls).toEqual([
      [windowsNode, [windowsCorepack, ...args], { ...options, shell: false }],
      ["pnpm.cmd", [...args], options], ["corepack.cmd", ["pnpm", ...args], options],
    ]);
    expect(options.shell).toBe(true);
  });

  it.each(["runPnpm", "runPnpmBuffered", "startPnpm"] as const)("recomputes %s fallback options", async (api) => {
    simulateWindows();
    const children = [queueChild(), queueChild(), queueChild()];
    const options = Object.freeze({ shell: true, cwd: "C:\\Trial Dir", windowsHide: true });
    const args = Object.freeze(["two words", ""]);
    const run = { runPnpm, runPnpmBuffered, startPnpm }[api];
    const pending = run(args, options);
    children[0].emit("error", commandError("ENOENT"));
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
    children[1].emit("error", commandError("ENOENT"));
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(3));
    const stdio = api === "startPnpm" ? {} : { stdio: api === "runPnpm" ? "inherit" : ["ignore", "pipe", "pipe"] };
    expect(vi.mocked(spawn).mock.calls).toEqual([
      [windowsNode, [windowsCorepack, ...args], { ...options, ...stdio, shell: false }],
      ["pnpm.cmd", [...args], { ...options, ...stdio }],
      ["corepack.cmd", ["pnpm", ...args], { ...options, ...stdio }],
    ]);
    children[2].emit("spawn");
    children[2].emit("close", 7, null);
    if (api === "startPnpm") await expect(pending).resolves.toBe(children[2]);
    else await expect(pending).resolves.toMatchObject({ code: 7, command: "corepack.cmd" });
    expect(options.shell).toBe(true);
  });
});

describe("pnpm sync contract", () => {
  it("preserves Windows prefix/space arguments and overrides only effective shell", () => {
    simulateWindows();
    const result = syncResult();
    const runner = vi.fn(() => result);
    const options = { cwd: "C:\\Trial Dir", env: { B2_FIXTURE: "yes" }, shell: true, encoding: "utf8" };
    expect(runPnpmSync(["exec", "fixture with spaces"], options, runner as unknown as typeof spawnSync)).toBe(result);
    expect(runner).toHaveBeenCalledExactlyOnceWith(
      windowsNode, [windowsCorepack, "exec", "fixture with spaces"], { ...options, shell: false },
    );
  });
  it("falls back only on ENOENT and preserves the final return object", () => {
    const expected = syncResult({ status: 7 });
    const runner = vi.fn()
      .mockReturnValueOnce(syncResult({ status: null, error: commandError("ENOENT") }))
      .mockReturnValueOnce(expected);
    const options = { cwd: "/fixture", env: { B2_FIXTURE: "yes" }, shell: false };
    expect(runPnpmSync(["--version"], options, runner)).toBe(expected);
    expect(runner.mock.calls).toEqual([
      ["pnpm", ["--version"], options], ["corepack", ["pnpm", "--version"], options],
    ]);
  });
  it("returns the final ENOENT after exhausting candidates", () => {
    const last = syncResult({ status: null, error: commandError("ENOENT") });
    const runner = vi.fn(() => last);
    expect(runPnpmSync(["--version"], {}, runner as unknown as typeof spawnSync)).toBe(last);
    expect(runner).toHaveBeenCalledTimes(2);
  });
  it.each([
    ["EACCES", { status: null, error: commandError("EACCES") }],
    ["EINVAL", { status: null, error: commandError("EINVAL") }],
    ["nonzero", { status: 13 }],
    ["empty stdout", { stdout: "" }],
    ["missing status", { status: undefined, stdout: "" }],
  ])("does not replace or retry a %s result", (_label, overrides) => {
    const expected = syncResult(overrides);
    const runner = vi.fn(() => expected);
    expect(runPnpmSync(["test"], {}, runner as unknown as typeof spawnSync)).toBe(expected);
    expect(runner).toHaveBeenCalledTimes(1);
  });
});

describe.each([["runPnpm", runPnpm], ["runPnpmBuffered", runPnpmBuffered]] as const)(
  "%s async contract", (_name, run) => {
    it("passes Windows prefix/options and returns nonzero code/signal without retry", async () => {
      simulateWindows();
      const child = queueChild();
      const options = { cwd: "C:\\Trial Dir", env: { B2_FIXTURE: "yes" }, shell: true };
      const pending = run(["exec", "argument with spaces"], options);
      expect(spawn).toHaveBeenCalledExactlyOnceWith(
        windowsNode, [windowsCorepack, "exec", "argument with spaces"],
        { ...options, shell: false, stdio: run === runPnpmBuffered ? ["ignore", "pipe", "pipe"] : "inherit" },
      );
      child.emit("close", 7, "SIGTERM");
      await expect(pending).resolves.toMatchObject({
        command: windowsNode, args: [windowsCorepack, "exec", "argument with spaces"],
        code: 7, signal: "SIGTERM", stdout: "", stderr: "",
      });
      expect(spawn).toHaveBeenCalledTimes(1);
    });
    it("falls back on ENOENT with the corepack argument prefix", async () => {
      const first = queueChild();
      const second = queueChild();
      const pending = run(["test"], { shell: false });
      first.emit("error", commandError("ENOENT"));
      first.emit("close", -2, null);
      await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
      expect(vi.mocked(spawn).mock.calls[1]?.slice(0, 2)).toEqual(["corepack", ["pnpm", "test"]]);
      second.emit("close", 0, null);
      await expect(pending).resolves.toMatchObject({ command: "corepack", code: 0, signal: null });
    });
    it("reports the final ENOENT instead of succeeding after exhaustion", async () => {
      const first = queueChild();
      const second = queueChild();
      const error = commandError("ENOENT");
      const pending = run(["test"]);
      first.emit("error", commandError("ENOENT"));
      await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
      second.emit("error", error);
      await expect(pending).resolves.toMatchObject({ code: 1, signal: null, error });
      expect(spawn).toHaveBeenCalledTimes(2);
    });
    it.each(["EACCES", "EINVAL"])("does not retry %s or overwrite it with close", async (code) => {
      const child = queueChild();
      const error = commandError(code);
      const pending = run(["test"]);
      child.emit("error", error);
      child.emit("close", 0, null);
      await expect(pending).resolves.toMatchObject({ code: 1, signal: null, error });
      expect(spawn).toHaveBeenCalledTimes(1);
    });
    it("normalizes signal-only termination to failure", async () => {
      const child = queueChild();
      const pending = run(["test"]);
      child.emit("close", null, "SIGINT");
      await expect(pending).resolves.toMatchObject({ code: 1, signal: "SIGINT" });
      expect(spawn).toHaveBeenCalledTimes(1);
    });
  },
);

it("buffers stdout/stderr and forwards decoded callbacks without passing callbacks to spawn", async () => {
  const child = queueChild();
  const onStdout = vi.fn();
  const onStderr = vi.fn();
  const pending = runPnpmBuffered(["test"], { cwd: "/fixture", onStdout, onStderr });
  child.stdout.emit("data", Buffer.from("first "));
  child.stdout.emit("data", "second\n");
  child.stderr.emit("data", Buffer.from("warning\n"));
  child.emit("close", 0, null);
  await expect(pending).resolves.toMatchObject({ code: 0, stdout: "first second\n", stderr: "warning\n" });
  expect(onStdout.mock.calls).toEqual([["first "], ["second\n"]]);
  expect(onStderr).toHaveBeenCalledExactlyOnceWith("warning\n");
  expect(spawn).toHaveBeenCalledExactlyOnceWith(
    "pnpm", ["test"], { cwd: "/fixture", stdio: ["ignore", "pipe", "pipe"] },
  );
});

describe("startPnpm child contract", () => {
  it("returns the child only on spawn, retaining options and later exit events", async () => {
    simulateWindows();
    const child = queueChild();
    const options = { cwd: "C:\\Trial Dir", env: { B2_FIXTURE: "yes" }, shell: true, stdio: "pipe" };
    const pending = startPnpm(["exec", "argument with spaces"], options);
    const resolved = vi.fn();
    void pending.then(resolved);
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledExactlyOnceWith(
      windowsNode, [windowsCorepack, "exec", "argument with spaces"], { ...options, shell: false },
    );
    child.emit("spawn");
    const actual = await pending;
    expect(actual).toBe(child);
    const onExit = vi.fn();
    actual.on("exit", onExit);
    child.emit("exit", 11, "SIGTERM");
    expect(onExit).toHaveBeenCalledExactlyOnceWith(11, "SIGTERM");
    expect(spawn).toHaveBeenCalledTimes(1);
  });
  it("returns the fallback child after ENOENT", async () => {
    const first = queueChild();
    const second = queueChild();
    const pending = startPnpm(["test"], { shell: false });
    first.emit("error", commandError("ENOENT"));
    expect(vi.mocked(spawn).mock.calls[1]?.slice(0, 2)).toEqual(["corepack", ["pnpm", "test"]]);
    second.emit("spawn");
    await expect(pending).resolves.toBe(second);
  });
  it.each(["EACCES", "EINVAL", "ENOENT"])("rejects %s when no eligible fallback remains", async (code) => {
    const first = queueChild();
    const second = code === "ENOENT" ? queueChild() : undefined;
    const error = commandError(code);
    const pending = startPnpm(["test"]);
    const assertion = expect(pending).rejects.toBe(error);
    first.emit("error", error);
    second?.emit("error", error);
    await assertion;
    expect(spawn).toHaveBeenCalledTimes(second ? 2 : 1);
  });
});

it.runIf(process.platform !== "win32")("executes a real POSIX child with space arguments and exit/output", async () => {
  vi.unstubAllGlobals();
  const { spawnSync: actualSpawnSync } = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "b2 pnpm argv "));
  roots.push(root);
  const fixture = path.join(root, "argv fixture.cjs");
  fs.writeFileSync(fixture, "process.stdout.write(JSON.stringify(process.argv.slice(2))); process.stderr.write('fixture stderr'); process.exitCode=7;\n");
  const result = actualSpawnSync(process.execPath, [fixture, "one two", "three"], { cwd: root, encoding: "utf8", shell: false });
  expect(result.status).toBe(7);
  expect(result.stderr).toBe("fixture stderr");
  expect(JSON.parse(result.stdout)).toEqual(["one two", "three"]);
});
