// Failure-only readiness-timeout evidence for planning:v2:prod:smoke (#306).
//
// Inactive unless the CI step sets FINANCE_READY_DIAG_DIR and the prod smoke
// passes a fresh FINANCE_READY_DIAG_CORR to its launcher tree. While active,
// lifecycle markers are fixed-enum lines on the inherited stderr that the prod
// smoke strips before forwarding (only when they are complete, valid and carry
// its own corr) and keeps only in bounded memory. Files are written only after a
// readiness timeout. Every function here swallows its own failures so
// diagnostics never change the caller's control flow or error.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { errorMonitor } from "node:events";
import { randomBytes } from "node:crypto";

export const READY_DIAG_CORR_ENV = "FINANCE_READY_DIAG_CORR";
export const READY_DIAG_DIR_ENV = "FINANCE_READY_DIAG_DIR";
export const READY_DIAG_MARKER = "@@FINANCE_READY_DIAG_V1@@";
// Each READY_TIMEOUT line starts with this record tag; CI checks for a line
// carrying its own run/attempt/job before uploading.
export const READY_TIMEOUT_RECORD = "ready_timeout_v1";

const CORR_PATTERN = /^[0-9a-f]{16}$/;
const MAX_MARKER_BYTES = 1_024;
const MARKER_HEAD_LIMIT = 128;
const MARKER_TAIL_LIMIT = 384;
const MAX_TRACKED_EMITTERS = 64;
const TAIL_LINES = 200;
const MAX_LINE_CHARS = 2_000;
const MAX_PARTIAL_CHARS = 8_192;
const MAX_BLOCK_DEPTH = 64;
const MAX_DEGRADED_REASONS = 16;
const OVERFLOW_SCAN_CARRY = 64;
const MAX_PROC_ENTRIES = 8_192;
const MAX_TREE_PROCESSES = 64;
const MAX_FDS_PER_PROCESS = 256;
const MAX_SOCKET_ROWS = 65_536;

// Fixed whitelists: anything outside them is dropped (emitter) or rejected and
// forwarded unchanged (collector). Shape checks alone are not used.
const OBSERVED_CHILD_ROLES = new Set(["WC_BOOTSTRAP", "BS_RUNTIME"]);
const STAGES = new Set([
  "WC_SPAWN_CALL",
  "WC_READY_RECEIVED",
  "WC_REGISTER_BEGIN",
  "WC_REGISTER_END",
  "WC_CONTINUE_SENT",
  "WC_STARTED_RECEIVED",
  "WC_RETURN",
  "WC_CATCH_ENTER",
  "WC_CLEANUP_SIGNAL",
  "WC_CLEANUP_WAIT_BEGIN",
  "WC_CLEANUP_WAIT_END",
  "BS_SHUTDOWN_REQUEST",
  "BS_IPC_DISCONNECT",
  "BS_READY_SENT",
  "BS_CONTINUE_RECEIVED",
  "BS_REGISTER_BEGIN",
  "BS_REGISTER_END",
  "BS_STARTED_SENT",
  "BS_RUNTIME_SETUP_FAILED",
  "LA_SERVER_STARTUP_RESOLVED",
  "LA_READY_REACHED",
  "LA_READY_TIMEOUT",
  "LA_SNAPSHOT",
  "SM_LAUNCHER_SPAWNED",
  "SM_LAUNCHER_EXIT",
  ...[...OBSERVED_CHILD_ROLES].flatMap((role) => ["SPAWNED", "EXIT", "CLOSE", "ERROR"].map((event) => `${role}_${event}`)),
]);
const ERROR_CODES = new Set([
  "EACCES", "EADDRINUSE", "EAGAIN", "EBUSY", "ECONNREFUSED", "ECONNRESET", "EEXIST", "EINTR", "EINVAL",
  "EIO", "EMFILE", "ENFILE", "ENOENT", "ENOSPC", "ENOTCONN", "EPERM", "EPIPE", "EROFS", "ESRCH", "ETIMEDOUT",
  "ERR_IPC_CHANNEL_CLOSED", "ERR_IPC_DISCONNECTED", "ERR_CHILD_PROCESS_IPC_REQUIRED",
]);
const RESULTS = new Set([
  ...["READY_WAIT", "PID_CHECK", "REGISTER", "STARTED_WAIT", "RUNTIME_FAILED"]
    .flatMap((phase) => [`${phase}_REGISTERED`, `${phase}_UNREGISTERED`]),
  "SKIPPED_EXITED",
  "IPC_SENT",
  ...["GROUP_KILL", "CHILD_KILL"].flatMap((mode) => [`${mode}_SENT`, `${mode}_ESRCH`, `${mode}_ERROR`]),
  "CONTINUED",
  "NOT_CONTINUED",
  "WRITTEN",
  "DISABLED",
  ...ERROR_CODES,
  "ERROR_OTHER",
  ...[...ERROR_CODES, "ERROR_OTHER"].map((code) => `WRITE_FAILED_${code}`),
]);
const SNAPSHOT_ROLES = new Set(["PROD_SMOKE", "LAUNCHER", "WRITER_BOOTSTRAP_LAUNCHER", "NEXT_PROD_SAFE", "DESCENDANT"]);

const SENSITIVE_CONTEXT = /(token|secret|passw(?:or)?d|authori[sz]ation|cookie|credential|bearer\s|api[-_.]?key|private[-_.]?key|session[-_.]?(?:id|key)|headers?\s*[:=]|\bbody\s*[:=]|\benv\s*[:=]|BEGIN [A-Z ]*PRIVATE KEY|gh[pousr]_[A-Za-z0-9]|github_pat_)/i;
const PEM_BEGIN = /-----BEGIN [A-Z0-9 ]+-----/;
const PEM_END = /-----END [A-Z0-9 ]+-----/;
// A sensitive opener ending in ':' or '=' without a bracket has no detectable
// end, so the rest of the stream stays masked.
const UNKNOWN_FORMAT_OPENER = /[:=]\s*$/;
const ANSI_CSI = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const CONTROL_CHAR = /[\x00-\x08\x0b-\x1f\x7f]/;
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f]/g;
const URL_USERINFO = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@"'<>]+@/gi;
const URL_QUERY = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s?#"'<>]*)[?#][^\s"'<>]*/gi;
// Any path with a query or fragment, with or without '=' (/planning?x, /a#b).
const PATH_QUERY = /(\/[^\s?#"'<>]*)[?#][^\s"'<>]+/g;
// Bare ?a=b query strings.
const ANY_QUERY = /\?[^\s"'<>]*=[^\s"'<>]*/g;
// key=value. The value runs to the next whitespace and joins quoted and
// unquoted pieces (NAME="a"b, NAME=a"b", NAME=a,b). Quoted pieces honour
// backslash escapes; a quote left open runs to the end of the line.
const ASSIGNMENT = /(?<![A-Za-z0-9_.-])(-{0,2}[A-Za-z_][A-Za-z0-9_.-]*)=((?:"(?:[^"\\]|\\.)*(?:"|\\?$)|'(?:[^'\\]|\\.)*(?:'|\\?$)|[^\s"'])*)/g;
// An overflow piece with a quoted assignment may continue on the next line.
const QUOTED_ASSIGNMENT_OPENER = /[A-Za-z0-9_.-]=["']/;
const UPPER_ENV_NAME = /^[A-Z][A-Z0-9_]{2,}$/;
// Lowercase assignments keep only plain numbers/booleans and a few enum keys
// (after trailing punctuation such as "code=1," or "signal=none)"); every
// other value, including anything quoted, is masked.
const TRAILING_PUNCTUATION = /[,;:.)\]}]+$/;
const SAFE_SCALAR = /^(?:-?\d+(?:\.\d+)*|true|false|null|none|undefined)$/i;
const SAFE_ENUM_KEYS = new Set(["runtime", "mode", "gate", "signal", "stage", "status", "host", "code", "exit"]);
const SAFE_ENUM_VALUE = /^[A-Za-z0-9_.:-]{1,32}$/;
const OPAQUE_VALUE = /(?<![A-Za-z0-9_+=-])[A-Za-z0-9_+=-]{32,}(?![A-Za-z0-9_+=-])/g;

const LIMITS = [
  "stdout/stderr tails are the shared server-chain stdio (launcher, writer bootstraps, next_prod_safe, standalone runtime); standalone-PID-only attribution is NOT_VERIFIED",
  "lifecycle markers show which awaited step was entered or finished, not why a step was slow",
  "a missing marker is not proof that a step was not reached: markers can be lost after an emitter's last received seq, from an emitter that never delivered one, after this file was written, or by a failed stderr write; absence-based conclusions are last-observed/NOT_VERIFIED",
  "the inherited stderr is a stream socket/pipe whose write atomicity is not guaranteed; interleaved, partial or field-invalid markers are counted and forwarded unchanged",
  "process names are reduced to role enums; NEXT_SERVER_TITLE absence does not prove startServer was not entered",
  "a single snapshot shows only the instant it was taken; it does not exclude earlier transient states; PID reuse/generation is NOT_VERIFIED",
  "a LISTEN socket owned by the runtime does not show what HTTP status /planning returned",
  "masking is conservative pattern detection, not proof that no secret remains; sensitive blocks without a detectable end mask the rest of that stream",
];

let emitterSeq = 0;
let emitterDrops = 0;
let selfStartTicks;

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveDiagDir(env) {
  const value = asString(env?.[READY_DIAG_DIR_ENV]);
  if (!value || !path.isAbsolute(value) || value.split(/[\\/]+/).includes("..")) return "";
  return value;
}

function resolveActiveCorr(env = process.env) {
  const corr = asString(env?.[READY_DIAG_CORR_ENV]);
  return CORR_PATTERN.test(corr) && resolveDiagDir(env) ? corr : "";
}

// Only three non-secret CI identifiers are read; anything else is NONE.
function ciAttribution(env) {
  const pick = (name, pattern) => {
    try {
      const value = asString(env?.[name]);
      return pattern.test(value) ? value : "NONE";
    } catch {
      return "NONE";
    }
  };
  return {
    run: pick("GITHUB_RUN_ID", /^\d{1,20}$/),
    attempt: pick("GITHUB_RUN_ATTEMPT", /^\d{1,5}$/),
    job: pick("GITHUB_JOB", /^[A-Za-z0-9_-]{1,100}$/),
  };
}

function monoNs() {
  return process.hrtime.bigint().toString();
}

function safeInt(value) {
  return Number.isSafeInteger(value) ? value : null;
}

function signalEnum(signal) {
  return typeof signal === "string" && Object.hasOwn(os.constants.signals, signal) ? signal : null;
}

// Never throws, even for an error whose code getter throws.
export function readyDiagErrorEnum(error) {
  try {
    const code = typeof error?.code === "string" ? error.code : "";
    return ERROR_CODES.has(code) ? code : "ERROR_OTHER";
  } catch {
    return "ERROR_OTHER";
  }
}

function countInto(counts, key) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function parseProcStat(text) {
  const close = text.lastIndexOf(")");
  if (close < 0) return null;
  const comm = text.slice(text.indexOf("(") + 1, close);
  const fields = text.slice(close + 2).split(" ");
  const toInt = (value) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  };
  return {
    state: /^[A-Za-z]$/.test(fields[0] ?? "") ? fields[0] : "?",
    ppid: toInt(fields[1]),
    pgid: toInt(fields[2]),
    utimeTicks: toInt(fields[11]),
    stimeTicks: toInt(fields[12]),
    startTicks: toInt(fields[19]),
    titleRole: comm.startsWith("next-server") ? "NEXT_SERVER_TITLE" : comm === "node" ? "NODE" : "OTHER",
  };
}

function readStartTicks(pid) {
  if (process.platform !== "linux" || !Number.isInteger(pid) || pid <= 0) return null;
  try {
    return parseProcStat(fs.readFileSync(`/proc/${pid}/stat`, "utf8"))?.startTicks ?? null;
  } catch {
    return null;
  }
}

function buildMarkerRecord(corr, stage, fields) {
  const record = {
    v: 1,
    corr,
    seq: 0,
    pid: process.pid,
    ppid: process.ppid,
    start_ticks: null,
    stage,
    mono_ns: monoNs(),
  };
  if (fields.target !== undefined) record.target = safeInt(fields.target);
  if (fields.targetStartTicks !== undefined) record.target_start_ticks = safeInt(fields.targetStartTicks);
  if (fields.code !== undefined) record.code = safeInt(fields.code);
  if (fields.signal !== undefined) record.signal = signalEnum(fields.signal);
  if (RESULTS.has(fields.result)) record.result = fields.result;
  return record;
}

export function emitReadyDiag(stage, fields = {}) {
  try {
    const corr = resolveActiveCorr();
    if (!corr || !STAGES.has(stage)) return;
    if (selfStartTicks === undefined) selfStartTicks = readStartTicks(process.pid);
    emitterSeq += 1;
    const record = buildMarkerRecord(corr, stage, fields);
    record.seq = emitterSeq;
    record.start_ticks = selfStartTicks;
    if (emitterDrops > 0) record.drops = emitterDrops;
    const line = Buffer.from(`${READY_DIAG_MARKER} ${JSON.stringify(record)}\n`);
    if (line.length > MAX_MARKER_BYTES) {
      emitterDrops += 1;
      return;
    }
    // One small write; a short write is completed synchronously. Atomicity
    // against other writers is not guaranteed (see LIMITS).
    let offset = 0;
    while (offset < line.length) offset += fs.writeSync(2, line, offset, line.length - offset);
    emitterDrops = 0;
  } catch {
    emitterDrops += 1;
  }
}

// Passive observation only: exit/close listeners and errorMonitor never change
// how an unhandled child "error" event behaves.
export function observeReadyDiagChild(child, role) {
  try {
    if (!child || !resolveActiveCorr() || !OBSERVED_CHILD_ROLES.has(role)) return;
    const target = child.pid;
    emitReadyDiag(`${role}_SPAWNED`, { target, targetStartTicks: readStartTicks(target) });
    child.once("exit", (code, signal) => emitReadyDiag(`${role}_EXIT`, { target, code, signal }));
    child.once("close", (code, signal) => emitReadyDiag(`${role}_CLOSE`, { target, code, signal }));
    child.on(errorMonitor, (error) => emitReadyDiag(`${role}_ERROR`, { target, result: readyDiagErrorEnum(error) }));
  } catch {
    // Observation must never alter the caller.
  }
}

function addressEnum(family, hex) {
  if (family === "TCP4") {
    if (hex === "0100007F") return "LOOPBACK";
    if (hex === "00000000") return "ANY";
    return "OTHER";
  }
  if (hex === "00000000000000000000000001000000") return "LOOPBACK";
  if (/^0+$/.test(hex)) return "ANY";
  return "OTHER";
}

function readListenSockets(port) {
  const sockets = new Map();
  const files = [];
  let rows = 0;
  for (const [file, family] of [["/proc/net/tcp", "TCP4"], ["/proc/net/tcp6", "TCP6"]]) {
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch (error) {
      files.push({ family, status: `READ_FAILED_${readyDiagErrorEnum(error)}` });
      continue;
    }
    files.push({ family, status: "READ_OK" });
    for (const line of text.split("\n").slice(1)) {
      if (rows >= MAX_SOCKET_ROWS) break;
      const cols = line.trim().split(/\s+/);
      if (cols.length < 10) continue;
      rows += 1;
      const local = cols[1];
      const separator = local.lastIndexOf(":");
      if (cols[3] !== "0A" || parseInt(local.slice(separator + 1), 16) !== port) continue;
      sockets.set(cols[9], { family, address: addressEnum(family, local.slice(0, separator)) });
    }
  }
  return { sockets, files, rows, truncated: rows >= MAX_SOCKET_ROWS };
}

// One immediate, bounded snapshot: no sleep, no second sample, no retry, no
// signals. Raw cmdline/environ are never read; process names become enums.
// Any unread or truncated input makes the snapshot PARTIAL and the listen
// ownership NOT_VERIFIED.
export function captureReadyTimeoutSnapshot({ rootPid, port, knownRoles = {} }) {
  if (process.platform !== "linux") return { status: "UNSUPPORTED_PLATFORM" };
  try {
    const table = new Map();
    const statFailures = {};
    let scanned = 0;
    let procScanTruncated = false;
    for (const name of fs.readdirSync("/proc")) {
      if (!/^\d+$/.test(name)) continue;
      if (scanned >= MAX_PROC_ENTRIES) {
        procScanTruncated = true;
        break;
      }
      scanned += 1;
      try {
        const row = parseProcStat(fs.readFileSync(`/proc/${name}/stat`, "utf8"));
        if (row) table.set(Number(name), row);
        else countInto(statFailures, "PARSE_FAILED");
      } catch (error) {
        countInto(statFailures, readyDiagErrorEnum(error));
      }
    }
    const children = new Map();
    for (const [pid, row] of table) {
      if (!children.has(row.ppid)) children.set(row.ppid, []);
      children.get(row.ppid).push(pid);
    }
    const rootPresent = table.has(rootPid);
    const tree = [];
    const queue = rootPresent ? [rootPid] : [];
    while (queue.length > 0 && tree.length < MAX_TREE_PROCESSES) {
      const pid = queue.shift();
      tree.push(pid);
      for (const child of children.get(pid) ?? []) queue.push(child);
    }
    const treeTruncated = queue.length > 0;
    const listen = readListenSockets(port);
    const owners = [];
    const ownedInodes = new Set();
    const fdDirFailures = {};
    let fdTruncatedProcesses = 0;
    let fdEntriesSkipped = 0;
    let readlinkFailures = 0;
    for (const pid of tree) {
      let fds = [];
      try {
        fds = fs.readdirSync(`/proc/${pid}/fd`);
      } catch (error) {
        countInto(fdDirFailures, readyDiagErrorEnum(error));
        continue;
      }
      if (fds.length > MAX_FDS_PER_PROCESS) {
        fdTruncatedProcesses += 1;
        fdEntriesSkipped += fds.length - MAX_FDS_PER_PROCESS;
        fds = fds.slice(0, MAX_FDS_PER_PROCESS);
      }
      for (const fd of fds) {
        let target = "";
        try {
          target = fs.readlinkSync(`/proc/${pid}/fd/${fd}`);
        } catch {
          readlinkFailures += 1;
          continue;
        }
        const inode = /^socket:\[(\d+)\]$/.exec(target)?.[1];
        const socket = inode ? listen.sockets.get(inode) : undefined;
        if (!socket) continue;
        ownedInodes.add(inode);
        owners.push({ pid, start_ticks: table.get(pid)?.startTicks ?? null, ...socket });
      }
    }
    const incomplete = [];
    if (!rootPresent) incomplete.push("ROOT_NOT_FOUND");
    if (procScanTruncated) incomplete.push("PROC_SCAN_TRUNCATED");
    if (Object.keys(statFailures).length > 0) incomplete.push("PROC_STAT_UNREADABLE");
    if (treeTruncated) incomplete.push("PROCESS_TREE_TRUNCATED");
    for (const file of listen.files) if (file.status !== "READ_OK") incomplete.push(`NET_${file.family}_UNREAD`);
    if (listen.truncated) incomplete.push("SOCKET_ROWS_TRUNCATED");
    if (Object.keys(fdDirFailures).length > 0) incomplete.push("FD_DIR_UNREADABLE");
    if (fdTruncatedProcesses > 0) incomplete.push("FD_LIST_TRUNCATED");
    if (readlinkFailures > 0) incomplete.push("FD_READLINK_FAILED");
    const roleOf = (pid) => {
      const role = knownRoles[pid];
      return SNAPSHOT_ROLES.has(role) ? role : "DESCENDANT";
    };
    return {
      status: incomplete.length === 0 ? "CAPTURED" : "PARTIAL",
      incomplete,
      mono_ns: monoNs(),
      root: {
        pid: rootPid,
        present: rootPresent,
        start_ticks: table.get(rootPid)?.startTicks ?? null,
        generation: "NOT_VERIFIED",
      },
      port,
      processes: tree.map((pid) => {
        const row = table.get(pid);
        return {
          pid,
          ppid: row.ppid,
          pgid: row.pgid,
          start_ticks: row.startTicks,
          state: row.state,
          role: roleOf(pid),
          title_role: row.titleRole,
          utime_ticks: row.utimeTicks,
          stime_ticks: row.stimeTicks,
        };
      }),
      process_tree_truncated: treeTruncated,
      proc_entries_scanned: scanned,
      proc_scan_truncated: procScanTruncated,
      proc_stat_failures: statFailures,
      listen: {
        // OBSERVED only when every input above was read in full.
        ownership_status: incomplete.length === 0 ? "OBSERVED" : "NOT_VERIFIED",
        net_files: listen.files,
        sockets_on_port: listen.sockets.size,
        owners_in_tree: owners.map((owner) => ({ ...owner, role: roleOf(owner.pid) })),
        // Not matched to a read fd of the observed tree; this is not proof of
        // ownership outside the tree.
        sockets_unattributed: listen.sockets.size - ownedInodes.size,
        socket_rows_read: listen.rows,
        socket_rows_truncated: listen.truncated,
        fd_dir_failures: fdDirFailures,
        fd_truncated_processes: fdTruncatedProcesses,
        fd_entries_skipped: fdEntriesSkipped,
        fd_readlink_failures: readlinkFailures,
      },
    };
  } catch (error) {
    return { status: "SNAPSHOT_FAILED", error: readyDiagErrorEnum(error) };
  }
}

function writeEvidence(dir, corr, ci, fileStem, payload) {
  if (!dir || !CORR_PATTERN.test(corr)) return "DISABLED";
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    // The attributed record comes first so a partial write still gates the
    // upload for this run/attempt/job only.
    fs.writeFileSync(
      path.join(dir, "READY_TIMEOUT"),
      `${READY_TIMEOUT_RECORD} run=${ci.run} attempt=${ci.attempt} job=${ci.job} corr=${corr}\n`,
      { flag: "a", mode: 0o600 },
    );
    fs.writeFileSync(
      path.join(dir, `${fileStem}-${corr}.json`),
      `${JSON.stringify(payload, null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    return "WRITTEN";
  } catch (error) {
    return `WRITE_FAILED_${readyDiagErrorEnum(error)}`;
  }
}

// Called from the launcher's catch after its own failure line and before the
// existing graceful stop. It acts only for waitForReady's own deadline error
// (the only source of this exact message), never throws and never waits.
export function captureLauncherReadyTimeout({ error, targetUrl, port, server } = {}) {
  try {
    const corr = resolveActiveCorr();
    if (!corr) return;
    if (!(error instanceof Error) || typeof targetUrl !== "string") return;
    if (error.message !== `desktop launcher timeout waiting for ${targetUrl}`) return;
    emitReadyDiag("LA_READY_TIMEOUT", { target: server?.pid });
    const knownRoles = { [process.pid]: "LAUNCHER" };
    if (Number.isInteger(server?.pid)) knownRoles[server.pid] = "WRITER_BOOTSTRAP_LAUNCHER";
    if (Number.isInteger(server?.runtimePid)) knownRoles[server.runtimePid] = "NEXT_PROD_SAFE";
    const ci = ciAttribution(process.env);
    const status = writeEvidence(resolveDiagDir(process.env), corr, ci, "launcher-timeout-snapshot", {
      schema: 2,
      corr,
      ci,
      trigger: "LAUNCHER_READY_TIMEOUT",
      written_mono_ns: monoNs(),
      snapshot: captureReadyTimeoutSnapshot({ rootPid: process.pid, port, knownRoles }),
      limits: LIMITS,
    });
    emitReadyDiag("LA_SNAPSHOT", { result: status });
  } catch {
    // The original timeout error and exit code remain authoritative.
  }
}

function newMaskState() {
  return { mode: "NONE", depth: 0, degraded: [] };
}

function addDegraded(state, reason) {
  if (!state.degraded.includes(reason) && state.degraded.length < MAX_DEGRADED_REASONS) state.degraded.push(reason);
}

// Net bracket depth of one line, ignoring brackets inside quotes. A line that
// ends inside a quote is ambiguous.
function scanBrackets(text) {
  let delta = 0;
  let quote = "";
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (quote) {
      if (ch === "\\") index += 1;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{" || ch === "[" || ch === "(") delta += 1;
    else if (ch === "}" || ch === "]" || ch === ")") delta -= 1;
  }
  return { delta, openQuote: quote !== "" };
}

// True when an assignment value ends inside a quote it opened (escape aware).
function valueQuoteOpen(value) {
  let quote = "";
  for (let index = 0; index < value.length; index += 1) {
    const ch = value[index];
    if (quote) {
      if (ch === "\\") index += 1;
      else if (ch === quote) quote = "";
    } else if (ch === "\"" || ch === "'") {
      quote = ch;
    }
  }
  return quote !== "";
}

function openSensitiveBlock(state, text) {
  const scan = scanBrackets(text);
  if (scan.openQuote) {
    state.mode = "REST";
    addDegraded(state, "SENSITIVE_OPENER_AMBIGUOUS");
  } else if (scan.delta > MAX_BLOCK_DEPTH) {
    state.mode = "REST";
    addDegraded(state, "BLOCK_DEPTH_LIMIT");
  } else if (scan.delta > 0) {
    state.mode = "BRACKET";
    state.depth = scan.delta;
  } else if (UNKNOWN_FORMAT_OPENER.test(text)) {
    state.mode = "REST";
    addDegraded(state, "SENSITIVE_OPENER_FORMAT_UNKNOWN");
  }
}

// state (optional, per stream) tracks sensitive blocks across lines: bracket
// blocks end only when their depth returns to zero, PEM blocks only at the END
// line; anything without a detectable end masks the rest of the stream and is
// marked degraded. Masking runs on the full line; the display limit is applied
// afterwards.
export function maskReadyDiagLine(line, state = null) {
  const reasons = [];
  let text = String(line).replace(ANSI_CSI, "");
  if (CONTROL_CHAR.test(text)) {
    text = text.replace(CONTROL_CHARS, "[CTRL]");
    reasons.push("CONTROL");
  }
  const whole = (kind) => ({ text: `[MASKED_LINE:${kind} len=${text.length}]`, reasons: [...reasons, kind] });
  if (state?.mode === "REST") return whole("SENSITIVE_REST_OF_STREAM");
  if (state?.mode === "PEM") {
    if (PEM_END.test(text)) state.mode = "NONE";
    return whole("SENSITIVE_BLOCK");
  }
  if (state?.mode === "BRACKET") {
    // A quote left open (later brackets may be quoted text) or more closes
    // than opens leaves no detectable end, so the rest stays masked.
    const scan = scanBrackets(text);
    state.depth += scan.delta;
    if (scan.openQuote) {
      state.mode = "REST";
      addDegraded(state, "BLOCK_QUOTE_AMBIGUOUS");
    } else if (state.depth < 0) {
      state.mode = "REST";
      addDegraded(state, "BLOCK_OVERCLOSED");
    } else if (state.depth === 0) {
      state.mode = "NONE";
    } else if (state.depth > MAX_BLOCK_DEPTH) {
      state.mode = "REST";
      addDegraded(state, "BLOCK_DEPTH_LIMIT");
    }
    return whole("SENSITIVE_BLOCK");
  }
  if (PEM_BEGIN.test(text)) {
    if (state && !PEM_END.test(text)) state.mode = "PEM";
    return whole("SENSITIVE_CONTEXT");
  }
  if (SENSITIVE_CONTEXT.test(text)) {
    if (state) openSensitiveBlock(state, text);
    return whole("SENSITIVE_CONTEXT");
  }
  const replaceWith = (pattern, replacement, reason) => {
    const next = text.replace(pattern, replacement);
    if (next !== text) reasons.push(reason);
    text = next;
  };
  replaceWith(URL_USERINFO, "$1[MASKED_USERINFO]@", "URL_USERINFO");
  replaceWith(URL_QUERY, "$1?[MASKED_QUERY]", "URL_QUERY");
  replaceWith(PATH_QUERY, "$1?[MASKED_QUERY]", "QUERY");
  replaceWith(ANY_QUERY, "?[MASKED_QUERY]", "QUERY");
  // Checked before the values are replaced: the line itself ends inside a quote.
  const lineQuoteOpen = scanBrackets(text).openQuote;
  let openValue = false;
  replaceWith(ASSIGNMENT, (match, key, value) => {
    if (!value) return match;
    const name = key.replace(/^-+/, "");
    if (/["']/.test(value)) {
      if (valueQuoteOpen(value)) openValue = true;
      return `${key}=[MASKED_ENV_VALUE]`;
    }
    const core = value.replace(TRAILING_PUNCTUATION, "");
    if (core && !UPPER_ENV_NAME.test(name)
      && (SAFE_SCALAR.test(core) || (SAFE_ENUM_KEYS.has(name) && SAFE_ENUM_VALUE.test(core)))) return match;
    return `${key}=[MASKED_ENV_VALUE]`;
  }, "ENV_VALUE");
  // A quoted value still open at the end of the line may continue on the next
  // physical line, which has no detectable end: mask the rest of the stream.
  if (openValue && lineQuoteOpen && state) {
    state.mode = "REST";
    addDegraded(state, "VALUE_QUOTE_UNCLOSED");
  }
  replaceWith(OPAQUE_VALUE, (match) => `[MASKED_OPAQUE len=${match.length}]`, "OPAQUE_VALUE");
  if (text.length > MAX_LINE_CHARS) {
    text = text.slice(0, MAX_LINE_CHARS);
    reasons.push("LINE_TRUNCATED");
  }
  return { text, reasons };
}

function createTail() {
  return {
    totalLines: 0,
    maskedLines: 0,
    reasonCounts: {},
    lines: [],
    partial: "",
    overflowPieces: 0,
    overflowLines: 0,
    overflowChars: 0,
    overflowCarry: "",
    overflowSensitive: false,
    maskState: newMaskState(),
    eof: false,
    partialFinalLine: false,
  };
}

// One entry per original LF-terminated line.
function recordTailLine(tail, masked) {
  tail.totalLines += 1;
  if (masked.reasons.length > 0) tail.maskedLines += 1;
  for (const reason of masked.reasons) tail.reasonCounts[reason] = (tail.reasonCounts[reason] ?? 0) + 1;
  tail.lines.push({ n: tail.totalLines, text: masked.text, reasons: masked.reasons });
  if (tail.lines.length > TAIL_LINES) tail.lines.shift();
}

// Over-long pieces are never stored; they are only scanned (with a small
// carry across piece boundaries) so a sensitive opener inside them still
// masks what follows.
function scanOverflowPiece(tail, piece) {
  const window = tail.overflowCarry + piece;
  if (SENSITIVE_CONTEXT.test(window) || PEM_BEGIN.test(window) || QUOTED_ASSIGNMENT_OPENER.test(window)) {
    tail.overflowSensitive = true;
  }
  tail.overflowCarry = window.slice(-OVERFLOW_SCAN_CARRY);
}

function finishOverflowLine(tail, lastPiece) {
  scanOverflowPiece(tail, lastPiece);
  const length = tail.overflowChars + lastPiece.length;
  const state = tail.maskState;
  if (state.mode === "BRACKET" || state.mode === "PEM") {
    state.mode = "REST";
    addDegraded(state, "OVERFLOW_LINE_IN_BLOCK");
  } else if (tail.overflowSensitive && state.mode === "NONE") {
    state.mode = "REST";
    addDegraded(state, "OVERFLOW_LINE_SENSITIVE");
  }
  tail.overflowLines += 1;
  tail.overflowChars = 0;
  tail.overflowCarry = "";
  tail.overflowSensitive = false;
  recordTailLine(tail, { text: `[MASKED_LINE:PARTIAL_OVERFLOW len=${length}]`, reasons: ["PARTIAL_OVERFLOW"] });
}

function ingestTail(tail, text) {
  let rest = tail.partial + text;
  tail.partial = "";
  let newline = rest.indexOf("\n");
  while (newline !== -1) {
    const line = rest.slice(0, newline).replace(/\r$/, "");
    if (tail.overflowChars > 0) finishOverflowLine(tail, line);
    else recordTailLine(tail, maskReadyDiagLine(line, tail.maskState));
    rest = rest.slice(newline + 1);
    newline = rest.indexOf("\n");
  }
  while (rest.length > MAX_PARTIAL_CHARS) {
    const piece = rest.slice(0, MAX_PARTIAL_CHARS);
    scanOverflowPiece(tail, piece);
    tail.overflowPieces += 1;
    tail.overflowChars += piece.length;
    rest = rest.slice(MAX_PARTIAL_CHARS);
  }
  tail.partial = rest;
}

function markTailEnd(tail) {
  tail.eof = true;
  tail.partialFinalLine = Boolean(tail.partial) || tail.overflowChars > 0;
}

function summarizeTail(tail) {
  let pending = null;
  if (tail.overflowChars > 0) {
    pending = { text: `[MASKED_LINE:PARTIAL_OVERFLOW len=${tail.overflowChars + tail.partial.length}]`, reasons: ["PARTIAL_OVERFLOW"] };
  } else if (tail.partial) {
    const copy = { ...tail.maskState, degraded: [...tail.maskState.degraded] };
    pending = maskReadyDiagLine(tail.partial, copy);
  }
  return {
    total_lines: tail.totalLines,
    kept_lines: tail.lines.length,
    omitted_before_tail: tail.totalLines - tail.lines.length,
    masked_lines: tail.maskedLines,
    reason_counts: tail.reasonCounts,
    partial_overflow_splits: tail.overflowPieces,
    overflow_lines: tail.overflowLines,
    eof: tail.eof,
    partial_final_line: tail.partialFinalLine,
    pending_partial: pending ? { text: pending.text, reasons: pending.reasons } : null,
    mask_state_at_end: tail.maskState.mode,
    mask_degraded: [...tail.maskState.degraded],
    lines: tail.lines,
  };
}

function markerPrefixStart(text) {
  for (let index = Math.max(0, text.length - READY_DIAG_MARKER.length); index < text.length; index += 1) {
    if (READY_DIAG_MARKER.startsWith(text.slice(index))) return index;
  }
  return -1;
}

const isPositiveInt = (value) => Number.isSafeInteger(value) && value > 0;
const isNonNegativeInt = (value) => Number.isSafeInteger(value) && value >= 0;

function hasRequiredMarkerFields(parsed) {
  return isPositiveInt(parsed.seq)
    && isPositiveInt(parsed.pid)
    && isNonNegativeInt(parsed.ppid)
    && (parsed.start_ticks === null || isNonNegativeInt(parsed.start_ticks))
    && typeof parsed.mono_ns === "string"
    && /^\d{1,24}$/.test(parsed.mono_ns);
}

function createCollector(dir, env) {
  const corr = randomBytes(8).toString("hex");
  const ci = ciAttribution(env);
  const head = [];
  const tail = [];
  const stats = { received: 0, overflow: 0, invalid: 0, invalid_fields: 0, foreign: 0, emitter_drops_reported: 0 };
  const streams = { stdout: createTail(), stderr: createTail() };
  const stages = new Set();
  const emitters = new Map();
  let untrackedEmitters = 0;
  let held = "";
  let smokeSeq = 0;

  // Per-emitter seq coverage keyed by pid and start ticks (generation).
  const track = (record) => {
    const key = `${record.pid}:${record.start_ticks ?? "UNKNOWN"}`;
    let entry = emitters.get(key);
    if (!entry) {
      if (emitters.size >= MAX_TRACKED_EMITTERS) {
        untrackedEmitters += 1;
        return;
      }
      entry = {
        pid: record.pid,
        start_ticks: record.start_ticks,
        generation: record.start_ticks === null ? "UNKNOWN" : "KNOWN",
        first_seq: record.seq,
        last_seq: record.seq,
        received: 0,
        gaps: 0,
        duplicates_or_reordered: 0,
        last_stage: null,
      };
      emitters.set(key, entry);
    } else if (record.seq > entry.last_seq + 1) {
      entry.gaps += record.seq - entry.last_seq - 1;
    } else if (record.seq <= entry.last_seq) {
      entry.duplicates_or_reordered += 1;
    }
    entry.received += 1;
    entry.last_seq = Math.max(entry.last_seq, record.seq);
    entry.last_stage = record.stage;
  };

  const keep = (record) => {
    stats.received += 1;
    stages.add(record.stage);
    track(record);
    if (head.length < MARKER_HEAD_LIMIT) {
      head.push(record);
      return;
    }
    tail.push(record);
    if (tail.length > MARKER_TAIL_LIMIT) {
      tail.shift();
      stats.overflow += 1;
    }
  };

  // Returns true only for a complete, whitelisted marker with this run's corr
  // and valid required fields.
  const acceptMarker = (jsonText) => {
    try {
      if (jsonText.length > MAX_MARKER_BYTES) {
        stats.invalid += 1;
        return false;
      }
      const parsed = JSON.parse(jsonText);
      if (parsed?.v !== 1 || !STAGES.has(parsed.stage)) {
        stats.invalid += 1;
        return false;
      }
      if (parsed.corr !== corr) {
        stats.foreign += 1;
        return false;
      }
      if (!hasRequiredMarkerFields(parsed)) {
        stats.invalid_fields += 1;
        return false;
      }
      const record = buildMarkerRecord(corr, parsed.stage, {
        target: parsed.target,
        targetStartTicks: parsed.target_start_ticks,
        code: parsed.code,
        signal: parsed.signal,
        result: parsed.result,
      });
      record.seq = parsed.seq;
      record.pid = parsed.pid;
      record.ppid = parsed.ppid;
      record.start_ticks = parsed.start_ticks;
      record.mono_ns = parsed.mono_ns;
      record.received_mono_ns = monoNs();
      if (isPositiveInt(parsed.drops)) stats.emitter_drops_reported += parsed.drops;
      keep(record);
      return true;
    } catch {
      stats.invalid += 1;
      return false;
    }
  };

  const coverage = () => {
    const list = [...emitters.values()].map((entry) => ({ ...entry, missing_before_first: entry.first_seq - 1 }));
    const gapOrUnknown = list.some((entry) => entry.gaps > 0
      || entry.duplicates_or_reordered > 0
      || entry.missing_before_first > 0
      || entry.generation === "UNKNOWN")
      || untrackedEmitters > 0
      || stats.invalid > 0
      || stats.invalid_fields > 0
      || stats.overflow > 0
      || stats.emitter_drops_reported > 0
      || held !== ""
      || !streams.stderr.eof;
    return {
      completeness: gapOrUnknown ? "GAP_OR_UNKNOWN_DETECTED" : "NO_DETECTED_GAP",
      emitters: list,
      untracked_emitters: untrackedEmitters,
      held_bytes: held.length,
      held_is_marker_prefix: held !== "" && (held.startsWith(READY_DIAG_MARKER) || READY_DIAG_MARKER.startsWith(held)),
      stderr_eof: streams.stderr.eof,
      undetectable: "a marker lost after an emitter's last received seq, or from an emitter that never delivered a marker, cannot be detected; NO_DETECTED_GAP is not completeness",
    };
  };

  return {
    corr,
    record(stage, fields = {}) {
      try {
        if (!STAGES.has(stage)) return;
        const record = buildMarkerRecord(corr, stage, fields);
        smokeSeq += 1;
        record.seq = smokeSeq;
        record.start_ticks = readStartTicks(process.pid);
        keep(record);
      } catch {
        // Diagnostics never alter the smoke.
      }
    },
    // Returns the stderr text to forward. Only valid own markers are removed;
    // anything else, including invalid or foreign marker text, is forwarded.
    filterStderr(text) {
      const input0 = held + text;
      held = "";
      let forward;
      try {
        let input = input0;
        forward = "";
        let newline = input.indexOf("\n");
        while (newline !== -1) {
          const line = input.slice(0, newline);
          const at = line.indexOf(READY_DIAG_MARKER);
          if (at !== -1 && acceptMarker(line.slice(at + READY_DIAG_MARKER.length))) {
            // Another writer's unterminated text before the marker is kept.
            forward += line.slice(0, at);
          } else {
            forward += input.slice(0, newline + 1);
          }
          input = input.slice(newline + 1);
          newline = input.indexOf("\n");
        }
        // Hold back a possible marker start until its newline arrives.
        const at = input.indexOf(READY_DIAG_MARKER);
        const start = at !== -1 ? at : markerPrefixStart(input);
        if (start !== -1 && input.length - start <= MAX_MARKER_BYTES) {
          forward += input.slice(0, start);
          held = input.slice(start);
        } else {
          forward += input;
        }
      } catch {
        // Fall back to the unfiltered text so existing output is never lost.
        held = "";
        return input0;
      }
      try {
        ingestTail(streams.stderr, forward);
      } catch {
        // A tail failure must not change what is forwarded.
      }
      return forward;
    },
    // At stream end everything still held is forwarded unchanged: a marker
    // without its newline is incomplete and therefore not removed.
    flushStderr() {
      const rest = held;
      held = "";
      try {
        if (rest.startsWith(READY_DIAG_MARKER)) stats.invalid += 1;
        if (rest) ingestTail(streams.stderr, rest);
        markTailEnd(streams.stderr);
      } catch {
        // Diagnostics never alter the smoke.
      }
      return rest;
    },
    ingestStdout(text) {
      try {
        ingestTail(streams.stdout, text);
      } catch {
        // Diagnostics never alter the smoke.
      }
    },
    markStdoutEnd() {
      try {
        markTailEnd(streams.stdout);
      } catch {
        // Diagnostics never alter the smoke.
      }
    },
    // Writes evidence only for a readiness timeout. General failures return
    // without writing anything.
    writeReadyTimeoutEvidence({ trigger, launcherPid, port }) {
      try {
        // The launcher's own snapshot file covers the case where its exit is
        // seen before its last stderr markers were read.
        const resolvedTrigger = trigger
          ?? (stages.has("LA_READY_TIMEOUT") ? "LAUNCHER_READY_TIMEOUT_MARKER" : null)
          ?? (fs.existsSync(path.join(dir, `launcher-timeout-snapshot-${corr}.json`))
            ? "LAUNCHER_READY_TIMEOUT_FILE"
            : null);
        if (!resolvedTrigger) return "NOT_A_READY_TIMEOUT";
        const knownRoles = { [process.pid]: "PROD_SMOKE" };
        if (Number.isInteger(launcherPid)) knownRoles[launcherPid] = "LAUNCHER";
        // The launcher captures its own snapshot on its timeout; the smoke
        // captures one only for its own readiness timeout.
        const snapshot = trigger
          ? captureReadyTimeoutSnapshot({ rootPid: process.pid, port, knownRoles })
          : null;
        return writeEvidence(dir, corr, ci, "ready-timeout-evidence", {
          schema: 2,
          corr,
          ci,
          trigger: resolvedTrigger,
          written_mono_ns: monoNs(),
          stdio_attribution: "SERVER_CHAIN_SHARED_STDIO",
          markers: { stats, coverage: coverage(), head, tail },
          tails: { stdout: summarizeTail(streams.stdout), stderr: summarizeTail(streams.stderr) },
          smoke_snapshot: snapshot,
          limits: LIMITS,
        });
      } catch (error) {
        return `WRITE_FAILED_${readyDiagErrorEnum(error)}`;
      }
    },
  };
}

// Smoke-side collector. Raw output is held only as the current partial line
// and a possible marker prefix (both bounded); complete lines are masked on
// arrival. Returns null (diagnostics off) when inactive or when setup fails.
export function createReadyDiagCollector(env = process.env) {
  try {
    const dir = resolveDiagDir(env);
    return dir ? createCollector(dir, env) : null;
  } catch {
    return null;
  }
}
