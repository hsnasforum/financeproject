import { ChildProcess } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { desktopBrowserCommand, isWslRuntime, openInDefaultBrowser } from "../../../scripts/planning_desktop_browser.mjs";

type BrowserSpawn = NonNullable<NonNullable<Parameters<typeof openInDefaultBrowser>[1]>["spawnImpl"]>;

const bootstrap = `http://127.0.0.1:43123/bootstrap?nonce=${"a".repeat(43)}`;
const linux = { platform: "linux" as const, env: { NODE_ENV: "test" as const }, release: "6.8.0-generic" };

describe("desktop browser handoff", () => {
  it.each([
    [{ WSL_INTEROP: "/run/WSL/1_interop" }, "generic"],
    [{ WSL_DISTRO_NAME: "Ubuntu" }, "generic"],
    [{}, "6.18.40.1-Microsoft-standard-WSL2"],
  ])("recognizes the existing WSL signals %o / %s", (env, release) => {
    const runtime = { platform: "linux" as const, env: { ...linux.env, ...env }, release };
    expect(isWslRuntime(runtime)).toBe(true);
    expect(desktopBrowserCommand(bootstrap, runtime)).toEqual({
      command: "cmd.exe", args: ["/d", "/v:off", "/c", "start", "", bootstrap],
    });
  });

  it("keeps native Linux on xdg-open", () => {
    expect(isWslRuntime(linux)).toBe(false);
    expect(desktopBrowserCommand(bootstrap, linux)).toEqual({ command: "xdg-open", args: [bootstrap] });
  });

  it("keeps Windows on its default browser command with an empty title", () => {
    const runtime = { ...linux, platform: "win32" as const };
    expect(isWslRuntime(runtime)).toBe(false);
    expect(desktopBrowserCommand(bootstrap, runtime)).toEqual({ command: "cmd.exe", args: ["/d", "/v:off", "/c", "start", "", bootstrap] });
  });

  it("does not let WSL environment markers override native macOS", () => {
    expect(desktopBrowserCommand(bootstrap, { platform: "darwin", env: { ...linux.env, WSL_DISTRO_NAME: "Ubuntu" }, release: "microsoft" })).toEqual({ command: "open", args: [bootstrap] });
  });

  it.each([
    `${bootstrap}&echo injected`, `${bootstrap}\n`, `${bootstrap}"`, `${bootstrap}%PATH%`,
    `${bootstrap}!PATH!`, `${bootstrap}#fragment`, bootstrap.replace("127.0.0.1", "example.com"),
    bootstrap.replace("43123", "65536"), bootstrap.replace("43123", "0"),
    "http://127.0.0.1:43123/planning", bootstrap.replace("http:", "https:"),
  ])("rejects non-broker or shell-bearing URLs", (url) => {
    expect(() => desktopBrowserCommand(url, { ...linux, env: { ...linux.env, WSL_DISTRO_NAME: "Ubuntu" } })).toThrow("Invalid desktop bootstrap URL");
  });

  it("passes the full bootstrap as one argument and waits for Windows handoff completion", async () => {
    const child = Object.assign(new ChildProcess(), { unref: vi.fn() });
    const spawnImpl = vi.fn<BrowserSpawn>().mockReturnValue(child);
    let settled = false;
    const launch = openInDefaultBrowser(bootstrap, { ...linux, env: { ...linux.env, WSL_INTEROP: "present" }, spawnImpl }).then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(child.unref).not.toHaveBeenCalled();
    expect(spawnImpl).toHaveBeenCalledWith("cmd.exe", ["/d", "/v:off", "/c", "start", "", bootstrap], { stdio: "ignore", detached: true, windowsHide: true, shell: false });
    child.emit("spawn");
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(child.unref).not.toHaveBeenCalled();
    child.emit("close", 0);
    await launch;
    expect(child.unref).toHaveBeenCalledOnce();
  });

  it("rejects a failed Windows handoff even after successful spawn", async () => {
    const child = Object.assign(new ChildProcess(), { unref: vi.fn() });
    const launch = openInDefaultBrowser(bootstrap, { ...linux, platform: "win32", spawnImpl: vi.fn<BrowserSpawn>().mockReturnValue(child) });
    const rejection = expect(launch).rejects.toThrow("Could not start desktop browser opener (cmd.exe)");
    child.emit("spawn");
    child.emit("close", 1);
    await rejection;
    expect(child.unref).not.toHaveBeenCalled();
  });

  it("keeps native Linux detached after a successful spawn", async () => {
    const child = Object.assign(new ChildProcess(), { unref: vi.fn() });
    const launch = openInDefaultBrowser(bootstrap, { ...linux, spawnImpl: vi.fn<BrowserSpawn>().mockReturnValue(child) });
    child.emit("spawn");
    await launch;
    expect(child.unref).toHaveBeenCalledOnce();
  });

  it("rejects opener startup errors without exposing the nonce", async () => {
    const child = Object.assign(new ChildProcess(), { unref: vi.fn() });
    const launch = openInDefaultBrowser(bootstrap, { ...linux, spawnImpl: vi.fn<BrowserSpawn>().mockReturnValue(child) });
    const rejection = expect(launch).rejects.toThrow("Could not start desktop browser opener (xdg-open)");
    child.emit("error", new Error(`ENOENT ${bootstrap}`));
    await rejection;
    expect(child.unref).not.toHaveBeenCalled();
  });

  it("sanitizes synchronous spawn failures too", async () => {
    await expect(openInDefaultBrowser(bootstrap, { ...linux, spawnImpl: () => { throw new Error(bootstrap); } })).rejects.toThrow("Could not start desktop browser opener (xdg-open)");
  });
});
