import { spawn, spawnSync } from "node:child_process";

export function pnpmCommandCandidates(platform = process.platform) {
  return platform === "win32"
    ? [
        { command: "pnpm.cmd", args: [] },
        { command: "corepack.cmd", args: ["pnpm"] },
      ]
    : [
        { command: "pnpm", args: [] },
        { command: "corepack", args: ["pnpm"] },
      ];
}

export function isCommandNotFound(error) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

export function formatPnpmCommand(args) {
  return ["pnpm", ...args].join(" ");
}

export function runPnpmSync(args, options = {}, runner = spawnSync) {
  const candidates = pnpmCommandCandidates();
  let lastResult = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const result = runner(candidate.command, [...candidate.args, ...args], options);
    lastResult = result;
    if (isCommandNotFound(result.error) && index + 1 < candidates.length) continue;
    return result;
  }

  return lastResult ?? { status: 1 };
}

function spawnOnce(candidate, args, options, mode) {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    const { onStdout, onStderr, ...spawnOptions } = options;
    const child = spawn(candidate.command, [...candidate.args, ...args], mode === "buffered"
      ? spawnOptions
      : { stdio: "inherit", ...spawnOptions });

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      resolve({
        command: candidate.command,
        args: [...candidate.args, ...args],
        stdout,
        stderr,
        ...payload,
      });
    };

    if (mode === "buffered") {
      child.stdout?.on("data", (chunk) => {
        const text = chunk instanceof Buffer ? chunk.toString("utf-8") : String(chunk);
        stdout += text;
        onStdout?.(text);
      });
      child.stderr?.on("data", (chunk) => {
        const text = chunk instanceof Buffer ? chunk.toString("utf-8") : String(chunk);
        stderr += text;
        onStderr?.(text);
      });
    }

    child.on("error", (error) => finish({ code: 1, signal: null, error }));
    child.on("close", (code, signal) => finish({ code: typeof code === "number" ? code : 1, signal: signal ?? null }));
  });
}

export async function runPnpm(args, options = {}) {
  const candidates = pnpmCommandCandidates();
  let lastResult = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const result = await spawnOnce(candidates[index], args, options, "inherit");
    lastResult = result;
    if (isCommandNotFound(result.error) && index + 1 < candidates.length) continue;
    return result;
  }

  return lastResult ?? { code: 1, signal: null };
}

export async function runPnpmBuffered(args, options = {}) {
  const { onStdout, onStderr, ...spawnOptions } = options;
  const candidates = pnpmCommandCandidates();
  let lastResult = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const result = await spawnOnce(
      candidates[index],
      args,
      { ...spawnOptions, stdio: ["ignore", "pipe", "pipe"], onStdout, onStderr },
      "buffered",
    );
    lastResult = result;
    if (isCommandNotFound(result.error) && index + 1 < candidates.length) continue;
    return result;
  }

  return lastResult ?? { code: 1, signal: null, stdout: "", stderr: "" };
}

export function startPnpm(args, options = {}) {
  const candidates = pnpmCommandCandidates();

  return new Promise((resolve, reject) => {
    const start = (candidateIndex = 0) => {
      const candidate = candidates[candidateIndex];
      const child = spawn(candidate.command, [...candidate.args, ...args], options);
      let settled = false;

      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        fn(value);
      };

      child.on("error", (error) => {
        if (isCommandNotFound(error) && candidateIndex + 1 < candidates.length) {
          start(candidateIndex + 1);
          return;
        }
        finish(reject, error);
      });
      child.on("spawn", () => finish(resolve, child));
    };

    start();
  });
}
