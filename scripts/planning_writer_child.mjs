import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  registerPlanningWriterLeaseChild,
} from "../src/lib/planning/deployment/writerLease.mjs";
import {
  emitReadyDiag,
  observeReadyDiagChild,
  readyDiagErrorEnum,
} from "./planning_ready_timeout_diag.mjs";

const BOOTSTRAP_READY = "planning-writer-bootstrap-ready";
const BOOTSTRAP_CONTINUE = "planning-writer-bootstrap-continue";
const BOOTSTRAP_SHUTDOWN = "planning-writer-bootstrap-shutdown";
const RUNTIME_STARTED = "planning-writer-runtime-started";
const RUNTIME_FAILED = "planning-writer-runtime-failed";
const DEFAULT_TIMEOUT_MS = 10_000;
const RUNTIME_SHUTDOWN_TIMEOUT_MS = 8_000;
const RUNTIME_REGISTRATION_FAILURE_SHUTDOWN_TIMEOUT_MS = 2_000;
const RUNTIME_FORCE_SHUTDOWN_TIMEOUT_MS = 5_000;

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function waitForTestRuntimeReady(filePath, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await access(filePath);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error("test planning writer runtime did not become ready");
}

function waitForChildMessage(child, acceptedTypes, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("error", onError);
      child.off("exit", onExit);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const onMessage = (message) => {
      if (!message || typeof message !== "object" || !acceptedTypes.has(message.type)) return;
      finish(resolve, message);
    };
    const onError = (error) => finish(reject, error);
    const onExit = (code, signal) => finish(
      reject,
      new Error(`registered writer child exited before startup (code=${code ?? "?"}, signal=${signal ?? "none"})`),
    );
    const timer = setTimeout(
      () => finish(reject, new Error("registered writer child startup timed out")),
      timeoutMs,
    );
    child.on("message", onMessage);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({
      code: child?.exitCode ?? null,
      signal: child?.signalCode ?? null,
    });
  }
  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      child.off("exit", onExit);
      child.off("close", onClose);
      child.off("error", onError);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onExit = (code, signal) => finish({ code, signal });
    const onClose = (code, signal) => finish({ code, signal });
    const onError = () => {
      if (typeof child.pid !== "number") finish({ code: null, signal: null });
    };
    const timer = Number.isFinite(timeoutMs)
      ? setTimeout(() => finish(null), Math.max(1, Math.trunc(timeoutMs)))
      : null;
    child.once("exit", onExit);
    child.once("close", onClose);
    child.once("error", onError);
  });
}

async function runWindowsTaskkill(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  return new Promise((resolve) => {
    const taskkill = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      taskkill.kill("SIGKILL");
      resolve(false);
    }, RUNTIME_FORCE_SHUTDOWN_TIMEOUT_MS);
    taskkill.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    taskkill.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

async function stopRuntimeAndConfirmExit(runtime, options = {}) {
  if (!runtime) return true;
  const signal = options.signal === "SIGINT" ? "SIGINT" : "SIGTERM";
  const gracefulTimeoutMs = Number.isFinite(options.gracefulTimeoutMs)
    ? Math.max(1, Math.trunc(options.gracefulTimeoutMs))
    : RUNTIME_SHUTDOWN_TIMEOUT_MS;
  const forceTimeoutMs = Number.isFinite(options.forceTimeoutMs)
    ? Math.max(1, Math.trunc(options.forceTimeoutMs))
    : RUNTIME_FORCE_SHUTDOWN_TIMEOUT_MS;

  if (process.platform === "win32" && typeof runtime.pid === "number") {
    if (runtime.exitCode !== null || runtime.signalCode !== null) {
      // Once the direct process has exited, Windows no longer provides a
      // reliable handle for proving that its unregistered descendants are
      // gone. The registered bootstrap must retain the lease fail-closed.
      return false;
    }
    const treeStopConfirmed = await runWindowsTaskkill(runtime.pid);
    const runtimeExitConfirmed = Boolean(await waitForChildExit(runtime, forceTimeoutMs));
    return treeStopConfirmed && runtimeExitConfirmed;
  }

  if (runtime.exitCode !== null || runtime.signalCode !== null) return true;

  try {
    runtime.kill(signal);
  } catch {
    // Exit observation below is the source of truth.
  }
  if (await waitForChildExit(runtime, gracefulTimeoutMs)) return true;

  try {
    runtime.kill("SIGKILL");
  } catch {
    // Exit observation below is the source of truth.
  }
  return Boolean(await waitForChildExit(runtime, forceTimeoutMs));
}

// Returns a fixed outcome enum for diagnostics only; callers' behavior is unchanged.
function killChildGroup(child, signal = "SIGTERM") {
  if (!child || child.exitCode !== null || child.signalCode !== null) return "SKIPPED_EXITED";
  const mode = process.platform !== "win32" && typeof child.pid === "number" ? "GROUP_KILL" : "CHILD_KILL";
  try {
    if (mode === "GROUP_KILL") {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
    return `${mode}_SENT`;
  } catch (error) {
    // The child may have exited between the state check and signal.
    return `${mode}_${error?.code === "ESRCH" ? "ESRCH" : "ERROR"}`;
  }
}

// Same steps as the exported function below, plus a diagnostic outcome enum.
function requestRegisteredShutdownWithOutcome(child, signal) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return "SKIPPED_EXITED";
  if (child.connected && typeof child.send === "function") {
    try {
      child.send({ type: BOOTSTRAP_SHUTDOWN, signal });
      return "IPC_SENT";
    } catch {
      // Fall through to the process signal when IPC is already closing.
    }
  }
  return killChildGroup(child, signal);
}

export function requestRegisteredPlanningWriterChildShutdown(child, signal = "SIGTERM") {
  // The exported contract still returns undefined.
  requestRegisteredShutdownWithOutcome(child, signal);
}

export async function spawnRegisteredPlanningWriterChild(input) {
  const dataRoot = asString(input?.dataRoot);
  const capability = asString(input?.capability);
  const command = asString(input?.command);
  const args = Array.isArray(input?.args) ? input.args.map(String) : [];
  const cwd = asString(input?.cwd) || process.cwd();
  const timeoutMs = Number.isFinite(input?.timeoutMs)
    ? Math.max(1_000, Math.trunc(input.timeoutMs))
    : DEFAULT_TIMEOUT_MS;
  if (!dataRoot || !capability || !command) {
    throw new Error("registered writer child requires dataRoot, capability, and command");
  }

  const env = {
    ...(input?.env ?? process.env),
    PLANNING_WRITER_DATA_ROOT: dataRoot,
    PLANNING_WRITER_LEASE_CAPABILITY: capability,
  };
  emitReadyDiag("WC_SPAWN_CALL");
  const bootstrap = spawn(process.execPath, [fileURLToPath(import.meta.url), "--bootstrap"], {
    cwd,
    env,
    detached: typeof input?.detached === "boolean"
      ? input.detached
      : process.platform !== "win32",
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  });
  observeReadyDiagChild(bootstrap, "WC_BOOTSTRAP");
  let bootstrapRegistered = false;
  let diagPhase = "READY_WAIT";

  try {
    const ready = await waitForChildMessage(bootstrap, new Set([BOOTSTRAP_READY]), timeoutMs);
    emitReadyDiag("WC_READY_RECEIVED", { target: bootstrap.pid });
    diagPhase = "PID_CHECK";
    if (ready.pid !== bootstrap.pid) {
      throw new Error("registered writer bootstrap PID did not match the spawned child");
    }
    diagPhase = "REGISTER";
    emitReadyDiag("WC_REGISTER_BEGIN", { target: bootstrap.pid });
    await registerPlanningWriterLeaseChild({
      dataRoot,
      capability,
      childPid: bootstrap.pid,
    });
    emitReadyDiag("WC_REGISTER_END", { target: bootstrap.pid });
    bootstrapRegistered = true;
    diagPhase = "STARTED_WAIT";
    const startedPromise = waitForChildMessage(
      bootstrap,
      new Set([RUNTIME_STARTED, RUNTIME_FAILED]),
      timeoutMs,
    );
    bootstrap.send({
      type: BOOTSTRAP_CONTINUE,
      command,
      args,
      cwd,
      testFailRuntimeRegistration: input?.testFailRuntimeRegistration === true
        && env.NODE_ENV === "test",
      testRuntimeReadyPath: input?.testFailRuntimeRegistration === true
        && env.NODE_ENV === "test"
        ? asString(input?.testRuntimeReadyPath)
        : "",
      testWaitForRuntimeExitBeforeRegistrationFailure:
        input?.testFailRuntimeRegistration === true
        && input?.testWaitForRuntimeExitBeforeRegistrationFailure === true
        && env.NODE_ENV === "test",
    });
    emitReadyDiag("WC_CONTINUE_SENT", { target: bootstrap.pid });
    const started = await startedPromise;
    if (started.type === RUNTIME_FAILED) {
      diagPhase = "RUNTIME_FAILED";
      throw new Error(asString(started.message) || "registered writer runtime failed to start");
    }
    emitReadyDiag("WC_STARTED_RECEIVED", { target: started.pid });
    Object.defineProperty(bootstrap, "runtimePid", {
      configurable: false,
      enumerable: false,
      value: started.pid,
      writable: false,
    });
    emitReadyDiag("WC_RETURN", { target: bootstrap.pid });
    return bootstrap;
  } catch (error) {
    emitReadyDiag("WC_CATCH_ENTER", {
      target: bootstrap.pid,
      result: `${diagPhase}_${bootstrapRegistered ? "REGISTERED" : "UNREGISTERED"}`,
    });
    let cleanupSignal;
    if (bootstrapRegistered) {
      cleanupSignal = requestRegisteredShutdownWithOutcome(bootstrap, "SIGTERM");
    } else {
      cleanupSignal = killChildGroup(bootstrap, "SIGTERM");
    }
    emitReadyDiag("WC_CLEANUP_SIGNAL", { target: bootstrap.pid, result: cleanupSignal });
    // Never return control to a lease owner while its registered bootstrap may
    // still own an unregistered runtime. This intentionally waits without a
    // timeout so callers cannot release the writer lease prematurely.
    emitReadyDiag("WC_CLEANUP_WAIT_BEGIN", { target: bootstrap.pid });
    const cleanupExit = await waitForChildExit(bootstrap);
    emitReadyDiag("WC_CLEANUP_WAIT_END", {
      target: bootstrap.pid,
      code: cleanupExit?.code,
      signal: cleanupExit?.signal,
    });
    throw error;
  }
}

async function runBootstrap() {
  if (typeof process.send !== "function") {
    throw new Error("planning writer bootstrap requires an IPC parent");
  }

  let continued = false;
  let runtime = null;
  let shutdownRequested = false;
  let shutdownSignal = "SIGTERM";
  let runtimeShutdownPromise = null;
  const stopRuntime = (options = {}) => {
    if (!runtime) return Promise.resolve(true);
    if (
      process.platform !== "win32"
      && (runtime.exitCode !== null || runtime.signalCode !== null)
    ) return Promise.resolve(true);
    if (runtimeShutdownPromise) return runtimeShutdownPromise;
    runtimeShutdownPromise = (async () => {
      const stopped = await stopRuntimeAndConfirmExit(runtime, {
        signal: shutdownSignal,
        ...options,
      });
      if (stopped) return true;

      // Preserve lease ownership until a late runtime exit is actually
      // observed. On Windows, an unsuccessful taskkill cannot prove that the
      // process tree is gone, so fail closed instead of releasing the lease.
      await waitForChildExit(runtime);
      if (process.platform === "win32") {
        await new Promise(() => undefined);
      }
      return true;
    })();
    return runtimeShutdownPromise;
  };
  const requestRuntimeShutdown = (signal = "SIGTERM") => {
    if (shutdownRequested) return;
    shutdownRequested = true;
    shutdownSignal = signal;
    emitReadyDiag("BS_SHUTDOWN_REQUEST", { target: runtime?.pid, signal });
    if (!runtime || runtime.exitCode !== null || runtime.signalCode !== null) {
      if (!continued) process.exit(128);
      return;
    }
    void stopRuntime();
  };
  const onControlMessage = (message) => {
    if (!message || typeof message !== "object" || message.type !== BOOTSTRAP_SHUTDOWN) return;
    const signal = message.signal === "SIGINT" ? "SIGINT" : "SIGTERM";
    requestRuntimeShutdown(signal);
  };
  process.on("message", onControlMessage);
  process.on("SIGINT", () => requestRuntimeShutdown("SIGINT"));
  process.on("SIGTERM", () => requestRuntimeShutdown("SIGTERM"));
  process.once("disconnect", () => {
    emitReadyDiag("BS_IPC_DISCONNECT", { result: continued ? "CONTINUED" : "NOT_CONTINUED" });
    if (!continued) {
      process.exit(78);
      return;
    }
    requestRuntimeShutdown("SIGTERM");
  });
  process.send({ type: BOOTSTRAP_READY, pid: process.pid });
  emitReadyDiag("BS_READY_SENT");

  const launch = await new Promise((resolve, reject) => {
    process.once("message", (message) => {
      if (!message || typeof message !== "object" || message.type !== BOOTSTRAP_CONTINUE) {
        reject(new Error("planning writer bootstrap received an invalid continue message"));
        return;
      }
      resolve(message);
    });
  });
  continued = true;
  emitReadyDiag("BS_CONTINUE_RECEIVED");

  const command = asString(launch.command);
  const args = Array.isArray(launch.args) ? launch.args.map(String) : [];
  const cwd = asString(launch.cwd) || process.cwd();
  if (!command) throw new Error("planning writer bootstrap command is required");

  runtime = spawn(command, args, {
    cwd,
    env: process.env,
    detached: false,
    stdio: "inherit",
  });
  observeReadyDiagChild(runtime, "BS_RUNTIME");
  if (shutdownRequested) void stopRuntime();
  runtime.once("error", () => undefined);

  try {
    if (typeof runtime.pid !== "number") throw new Error("planning writer runtime PID is unavailable");
    if (launch.testFailRuntimeRegistration === true && process.env.NODE_ENV === "test") {
      const readyPath = asString(launch.testRuntimeReadyPath);
      if (readyPath) await waitForTestRuntimeReady(readyPath);
      if (launch.testWaitForRuntimeExitBeforeRegistrationFailure === true) {
        const exited = await waitForChildExit(runtime, 5_000);
        if (!exited) throw new Error("test planning writer runtime did not exit before registration failure");
      }
      throw new Error("test-injected planning writer runtime registration failure");
    }
    emitReadyDiag("BS_REGISTER_BEGIN", { target: runtime.pid });
    await registerPlanningWriterLeaseChild({
      dataRoot: process.env.PLANNING_WRITER_DATA_ROOT,
      capability: process.env.PLANNING_WRITER_LEASE_CAPABILITY,
      childPid: runtime.pid,
    });
    emitReadyDiag("BS_REGISTER_END", { target: runtime.pid });
    process.send?.({ type: RUNTIME_STARTED, pid: runtime.pid });
    emitReadyDiag("BS_STARTED_SENT", { target: runtime.pid });
  } catch (error) {
    emitReadyDiag("BS_RUNTIME_SETUP_FAILED", { target: runtime.pid, result: readyDiagErrorEnum(error) });
    await stopRuntime({
      gracefulTimeoutMs: RUNTIME_REGISTRATION_FAILURE_SHUTDOWN_TIMEOUT_MS,
    });
    process.send?.({
      type: RUNTIME_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
    process.exit(78);
  }

  const result = await waitForChildExit(runtime);
  if (runtimeShutdownPromise) await runtimeShutdownPromise;
  process.off("message", onControlMessage);
  if (result.signal) {
    process.exit(128);
  }
  process.exit(result.code ?? 1);
}

if (process.argv.includes("--bootstrap")) {
  runBootstrap().catch((error) => {
    process.send?.({
      type: RUNTIME_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
    process.exit(78);
  });
}
