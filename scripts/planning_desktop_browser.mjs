import os from "node:os";
import { spawn } from "node:child_process";

export function isWslRuntime({ platform = process.platform, env = process.env, release = os.release() } = {}) {
  // Keep the WSL signals used by next_dev_safe.mjs; other platforms remain native.
  return platform === "linux" && (
    Boolean(env.WSL_INTEROP)
    || Boolean(env.WSL_DISTRO_NAME)
    || release.toLowerCase().includes("microsoft")
  );
}

export function desktopBrowserCommand(url, runtime = {}) {
  // cmd.exe interprets its arguments as a command. Only the broker's literal
  // loopback URL alphabet may cross that boundary, never arbitrary shell text.
  const match = typeof url === "string"
    ? /^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})\/bootstrap\?nonce=[A-Za-z0-9_-]{43}$/.exec(url)
    : null;
  if (!match || Number(match[1]) > 65535) throw new Error("Invalid desktop bootstrap URL");

  const platform = runtime.platform ?? process.platform;
  if (platform === "win32" || isWslRuntime(runtime)) {
    return { command: "cmd.exe", args: ["/d", "/v:off", "/c", "start", "", url] };
  }
  return { command: platform === "darwin" ? "open" : "xdg-open", args: [url] };
}

/**
 * @param {string} url
 * @param {{
 *   platform?: NodeJS.Platform,
 *   env?: NodeJS.ProcessEnv,
 *   release?: string,
 *   spawnImpl?: (command: string, args: readonly string[], options: import("node:child_process").SpawnOptions) => import("node:child_process").ChildProcess
 * }} [options]
 */
export async function openInDefaultBrowser(url, { spawnImpl = spawn, ...runtime } = {}) {
  const { command, args } = desktopBrowserCommand(url, runtime);
  await new Promise((resolve, reject) => {
    const failed = () => reject(new Error(`Could not start desktop browser opener (${command})`));
    let child;
    try {
      child = spawnImpl(command, args, { stdio: "ignore", detached: true, windowsHide: true, shell: false });
    } catch {
      failed();
      return;
    }
    // Raw spawn errors can include argv (and the one-shot nonce). Never log them.
    child.once("error", failed);
    child.once("spawn", () => {
      // A short-lived secondary launcher must keep WSL interop alive until
      // cmd.exe has handed the URL to Windows' default browser.
      if (command === "cmd.exe") return;
      child.unref();
      resolve();
    });
    if (command === "cmd.exe") {
      child.once("close", (code) => {
        if (code !== 0) return failed();
        child.unref();
        resolve();
      });
    }
  });
}
