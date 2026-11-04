import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// SYNTHETIC run trees only, laid out like the current driver writes them (receipt at <root>/result.json, journey
// files under <root>/private/run). Record shapes follow the current collectors: no request ids on events rows and
// no join key between events, CDP, page and server records. The CLI is spawned as a real entry point; expected
// values are written by hand and do not come from the implementation.
type Row = Record<string, unknown>;
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "journey-strict-cli-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, "private", "run", "server-observer"), { recursive: true });
  fs.mkdirSync(path.join(root, "private", "run", "frames"), { recursive: true });
  return root;
}
const runFile = (root: string, name: string) => path.join(root, "private", "run", name);
const jsonl = (rows: Row[]) => rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
const driverFault = (row: Row) => {
  const copy: Row = { ...row };
  delete copy.at;
  delete copy.stage;
  delete copy.faultClass;
  return { ...copy, duringShutdown: false };
};
const driverFor = (faults: Row[], extra: Row = {}) => ({
  stage: "stage-1",
  actions: 1,
  status: faults.length > 0 ? "OBSERVED_WITH_UNRESOLVED_FAULTS" : "STAGE_OBSERVED_COMPLETE",
  humanReportedComplete: true,
  browserClosed: true,
  observationFault: null,
  reviewFaults: faults.map(driverFault),
  ...extra,
});
const receipt = (dataLabel: string, exit: number) => ({
  data_label: dataLabel,
  source_access: false,
  phases: [
    { phase: "db-prepare", argv: ["/usr/bin/bwrap", "--unshare-net"], timed_out: false, outer_reaped: true, init_exited: true, outer_exit: 0, status_fd: { exit_code: 0, malformed: false }, infrastructure_ok: true },
    { phase: "journey", argv: ["/usr/bin/bwrap", "--unshare-net", "--", "/opt/node/bin/node", "driver.mjs"], timed_out: false, outer_reaped: true, init_exited: true, outer_exit: exit, status_fd: { exit_code: exit, malformed: false }, infrastructure_ok: true },
  ],
});
// Lifecycle records the fixed driver writes: numbered observations ("initial", then "after-<action>") and commands.
const observation = (id: string, reason: string): Row => ({ at: `t-${id}`, stage: "stage-1", type: "OBSERVATION", id, reason, missing: [] });
const command = (sequence: number, action: string): Row => ({ at: `t-c${sequence}`, stage: "stage-1", type: "COMMAND", sequence, action });
const shutdown: Row = { at: "t-end", stage: "stage-1", type: "OWNED_SERVER_SHUTDOWN", code: null, signal: "SIGTERM" };
const fault = (index: number, value: Row): Row => ({ at: `t-f${index}`, stage: "stage-1", ...value, faultClass: "REVIEW" });

function writeRun(root: string, events: Row[], driver: Row, receiptValue: Row | null) {
  fs.writeFileSync(runFile(root, "events.jsonl"), jsonl(events));
  fs.writeFileSync(runFile(root, "driver-result.json"), JSON.stringify(driver, null, 2) + "\n");
  if (receiptValue) fs.writeFileSync(path.join(root, "result.json"), JSON.stringify(receiptValue, null, 2) + "\n");
}
function cli(args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", "scripts/journey_strict.mts", ...args], { cwd: process.cwd(), encoding: "utf8" });
}
const errorCode = (stderr: string) => (JSON.parse(stderr) as { error: { code: string } }).error.code;
const baseArgs = (root: string) => ["--run-id", "synthetic", "--events", runFile(root, "events.jsonl"), "--driver-result", runFile(root, "driver-result.json")];
const withReceipt = (root: string) => [...baseArgs(root), "--receipt", path.join(root, "result.json")];

const J_CANCEL_PATHS = [
  "/api/planning/v2/assumptions/snapshots",
  "/planning/reports",
  "/api/planning/v2/assumptions/snapshots",
  "/planning",
  "/api/planning/v2/assumptions/snapshots",
  "/api/planning/v3/transactions/batches",
  "/api/planning/v3/accounts",
  "/api/planning/v3/categories/rules",
  "/api/planning/v3/transactions/batches",
  "/api/planning/v3/accounts",
  "/api/planning/v2/runs",
  "/api/planning/v2/assumptions/snapshots",
  "/api/planning/v3/transactions/batches",
  "/api/planning/v3/accounts",
  "/api/planning/v2/assumptions/snapshots",
];

function writeNineteenRowRun() {
  const root = makeRoot();
  const faults = [
    ...J_CANCEL_PATHS.map((p, index) => fault(index, { type: "REQUEST_FAILED", method: "GET", local: true, path: p, error: "net::ERR_ABORTED" })),
    fault(15, { type: "HTTP_ERROR", local: true, path: "/api/public/disclosure/corpcodes/status", status: 409 }),
    fault(16, { type: "CONSOLE", level: "error", message: "Failed to load resource: the server responded with a status of 409 (Conflict)", location: { local: true, path: "/api/public/disclosure/corpcodes/status" } }),
    fault(17, { type: "HTTP_ERROR", local: true, path: "/api/settings/backup/export", status: 403 }),
    fault(18, { type: "CONSOLE", level: "error", message: "Failed to load resource: the server responded with a status of 403 (Forbidden)", location: { local: true, path: "/api/settings/backup/export" } }),
  ];
  const rows = [
    observation("0001", "initial"), ...faults.slice(0, 10), command(1, "click"), observation("0002", "after-click"),
    ...faults.slice(10), command(2, "click"), observation("0003", "after-click"), command(3, "stop"), shutdown,
  ];
  writeRun(root, rows, driverFor(faults, { actions: 2 }), receipt("FIXTURE_REPLAY_NOT_PROVIDER_LIVE", 2));
  return { root, rows };
}

function writeCancelRun() {
  const root = makeRoot();
  const cancel = fault(0, { type: "REQUEST_FAILED", method: "GET", local: true, path: "/api/x", error: "net::ERR_ABORTED" });
  const probe = [
    { src: "cdp", ev: "attached", pageId: 1 },
    { src: "cdp", ev: "Network.requestWillBeSent", requestId: "154.27", pageId: 1, method: "GET", path: "/api/x" },
    { src: "page", pageId: 1, kind: "fetch", doc: 100.5, top: true, request: 1, signal: 1, signalState: "own-data", signalAlreadyAborted: false, path: "/api/x" },
    { src: "page", pageId: 1, kind: "abort", doc: 100.5, top: true, signal: 1, requests: [1], stackFrames: 3, stackOmitted: 0, stack: [
      "Error: probe304-abort-listener",
      "at useThing.useEffect (webpack-internal:///(app-pages-browser)/./src/components/useThing.ts:60:32)",
      "at commitHookEffectListUnmount (webpack-internal:///(app-pages-browser)/./node_modules/react-dom/cjs/react-dom-client.development.js:13767:17)",
    ] },
    { src: "cdp", ev: "Network.loadingFailed", requestId: "154.27", pageId: 1, errorText: "net::ERR_ABORTED", canceled: true },
  ];
  const counters = { file: "probe.jsonl", serverObserverDir: "server-observer", lines: probe.length, writeErrors: 0, cdpAttached: 1, cdpAttachErrors: 0, pageRecords: 2, unparsedPageRecords: 0, driverDroppedStackLines: 0 };
  writeRun(root, [observation("0001", "initial"), cancel, command(1, "click"), observation("0002", "after-click"), command(2, "stop"), shutdown],
    driverFor([cancel], { probe: counters }), receipt("SYNTHETIC_NEW_EMPTY_STATE", 2));
  fs.writeFileSync(runFile(root, "probe.jsonl"), jsonl(probe));
  fs.writeFileSync(runFile(root, "server-observer/43.jsonl"), jsonl([
    { ev: "observer-loaded", pid: 43 },
    { ev: "request-start", id: "43-r1", socketId: "43-s1", method: "GET", path: "/api/x" },
    { ev: "request-aborted", id: "43-r1", statusCode: 200, headersSent: false, writableFinished: false },
    { ev: "process-exit", code: 143 },
  ]));
  fs.writeFileSync(runFile(root, "server.stderr"), "ready\n");
  fs.writeFileSync(runFile(root, "frames/0015.text.txt"), "Monthly plan\nNo saved latest assumptions snapshot; defaults were used.\n");
  const args = [
    ...withReceipt(root),
    "--probe", runFile(root, "probe.jsonl"),
    "--server-observer", runFile(root, "server-observer/43.jsonl"),
    "--server-stderr", runFile(root, "server.stderr"),
    "--health-warning", `${runFile(root, "frames/0015.text.txt")}:2`,
  ];
  return { root, args };
}

const fatalRow: Row = { at: "t-x", stage: "stage-1", type: "SERVER_EXIT", code: 1, signal: null, faultClass: "FATAL" };
const completedEvents = (): Row[] => [observation("0001", "initial"), command(1, "click"), observation("0002", "after-click"), command(2, "stop"), shutdown];
function writeCompletedRun() {
  const root = makeRoot();
  writeRun(root, completedEvents(), driverFor([]), receipt("SYNTHETIC_NEW_EMPTY_STATE", 0));
  return root;
}

function rewriteJson(file: string, change: (value: Row) => void) {
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as Row;
  change(value);
  fs.writeFileSync(file, JSON.stringify(value));
}

describe("journey:strict CLI", () => {
  it("keeps all 19 raw rows verbatim, in order, with duplicates and the original exit, and fails strict", () => {
    const { root, rows } = writeNineteenRowRun();
    const result = cli(withReceipt(root));
    expect(result.stderr).toBe("");
    expect(result.status).toBe(1);
    const out = JSON.parse(result.stdout);
    const eventLines = fs.readFileSync(runFile(root, "events.jsonl"), "utf8").split("\n");
    expect(out.schema).toBe("journey-strict/v2");
    expect(out.rawCount).toBe(19);
    expect(out.rawFaults.map((row: { line: number }) => row.line)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
    expect(out.rawFaults.map((row: { index: number }) => row.index)).toEqual(Array.from({ length: 19 }, (_, index) => index));
    for (const row of out.rawFaults as Array<{ line: number; rawLine: string; parsed: Row }>) {
      expect(row.rawLine).toBe(eventLines[row.line - 1]);
      expect(row.parsed).toEqual(rows[row.line - 1]);
    }
    expect(out.counts).toEqual({ EXPECTED_CANCEL: 0, EXPECTED_DATA_ABSENCE: 0, UNRESOLVED: 15, FAIL: 4 });
    expect(out.duplicateGroups).toEqual([[0, 2, 4, 11, 14], [5, 8, 12], [6, 9, 13]]);
    expect(out.faultListComparison).toMatchObject({ eventsFaultCount: 19, driverFaultCount: 19, match: true });
    expect(out.originalExit).toMatchObject({ journeyOuterExit: 2, statusFdExit: 2 });
    expect(out.runGate.status).toBe("MET");
    expect(out.strict).toMatchObject({ result: "FAIL", exitCode: 1, failingRunGate: [] });
    expect(out.strict.failingRows).toEqual(Array.from({ length: 19 }, (_, index) => index));
    expect(out.inputs.map((input: { role: string }) => input.role)).toEqual(["events", "driver-result", "receipt"]);
  });

  it("keeps a native cancel UNRESOLVED and lists the screen warning apart from the raw count", () => {
    const { args } = writeCancelRun();
    const result = cli(args);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(1);
    const out = JSON.parse(result.stdout);
    expect(out.rawCount).toBe(1);
    expect(out.rawFaults[0]).toMatchObject({ classification: "UNRESOLVED", strictImpact: "FAIL", line: 2 });
    expect(out.rawFaults[0].conditionResults.instrumentationComplete.status).toBe("MET");
    expect(out.rawFaults[0].conditionResults.sameRequestCdpCanceled.status).toBe("NO_EVIDENCE");
    expect(out.rawFaults[0].conditionResults.appCleanupCausality.status).toBe("NO_EVIDENCE");
    expect(out.healthWarnings).toHaveLength(1);
    expect(out.healthWarnings[0]).toMatchObject({ sourceKind: "SCREEN_TEXT", classification: "UNRESOLVED", countedInRaw: false });
    expect(out.originalExit).toMatchObject({ journeyOuterExit: 2, statusFdExit: 2 });
    expect(out.strict).toMatchObject({ result: "FAIL", exitCode: 1, failingRows: [0], failingHealthWarnings: [0], failingRunGate: [] });
  });

  it("passes a completed zero-fault run and writes the same JSON to a new output file only", () => {
    const root = writeCompletedRun();
    const output = path.join(root, "strict.json");
    const first = cli([...withReceipt(root), "--output", output]);
    expect(first.stderr).toBe("");
    expect(first.status).toBe(0);
    const out = JSON.parse(first.stdout);
    expect(out).toMatchObject({ rawCount: 0, rawFaults: [], fatalFaults: [], originalExit: { journeyOuterExit: 0, statusFdExit: 0 } });
    expect(out.strict).toMatchObject({ result: "PASS", exitCode: 0 });
    expect(fs.readFileSync(output, "utf8")).toBe(first.stdout);
    fs.writeFileSync(output, "keep\n");
    const second = cli([...withReceipt(root), "--output", output]);
    expect(second.status).toBe(2);
    expect(second.stdout).toBe("");
    expect(errorCode(second.stderr)).toBe("OUTPUT_EXISTS");
    expect(fs.readFileSync(output, "utf8")).toBe("keep\n");
  });

  const incomplete: Array<[string, (root: string) => string[], string]> = [
    ["no receipt is given", (root) => baseArgs(root), "receiptJourneyComplete"],
    ["the driver stopped on error", (root) => { rewriteJson(runFile(root, "driver-result.json"), (driver) => { driver.status = "STOPPED_ON_ERROR"; }); return withReceipt(root); }, "driverComplete"],
    ["the journey timed out", (root) => { rewriteJson(path.join(root, "result.json"), (value) => { (value.phases as Row[])[1].timed_out = true; }); return withReceipt(root); }, "receiptJourneyComplete"],
    ["the events stop before the server shutdown", (root) => { fs.writeFileSync(runFile(root, "events.jsonl"), jsonl(completedEvents().slice(0, -1))); return withReceipt(root); }, "eventsDrained"],
    ["a FATAL fault row was recorded", (root) => { const events = completedEvents(); events.splice(1, 0, fatalRow); fs.writeFileSync(runFile(root, "events.jsonl"), jsonl(events)); return withReceipt(root); }, "noFatalFault"],
    ["a save answered HTTP 200 with ok false", (root) => {
      const events = completedEvents();
      events.splice(2, 0, { at: "t-r", stage: "stage-1", type: "JSON_RESULT", local: true, path: "/api/planning/v2/profiles", method: "POST", status: 200, ok: false, financialResultOnly: {}, savedIds: {} });
      fs.writeFileSync(runFile(root, "events.jsonl"), jsonl(events));
      return withReceipt(root);
    }, "noRecordedResultFailure"],
    ["only the shutdown row is left", (root) => { fs.writeFileSync(runFile(root, "events.jsonl"), jsonl([shutdown])); return withReceipt(root); }, "lifecycleRecorded"],
    ["the head of the events was cut", (root) => { fs.writeFileSync(runFile(root, "events.jsonl"), jsonl(completedEvents().slice(2))); return withReceipt(root); }, "lifecycleRecorded"],
    ["the driver declares a probe that is not given", (root) => {
      rewriteJson(runFile(root, "driver-result.json"), (driver) => { driver.probe = { file: "probe.jsonl", serverObserverDir: "server-observer", lines: 1, writeErrors: 0, cdpAttached: 1, cdpAttachErrors: 0, pageRecords: 0, unparsedPageRecords: 0, driverDroppedStackLines: 0 }; });
      return withReceipt(root);
    }, "probeComplete"],
    ...([["null", null], ["an array", []], ["a string", "broken"]] as Array<[string, unknown]>).map(([name, value]): [string, (root: string) => string[], string] => [
      `the driver-result probe is ${name}`,
      (root) => { rewriteJson(runFile(root, "driver-result.json"), (driver) => { driver.probe = value; }); return withReceipt(root); },
      "probeComplete",
    ]),
    ["the declared probe lost a write", (root) => {
      rewriteJson(runFile(root, "driver-result.json"), (driver) => { driver.probe = { file: "probe.jsonl", serverObserverDir: "server-observer", lines: 1, writeErrors: 1, cdpAttached: 1, cdpAttachErrors: 0, pageRecords: 0, unparsedPageRecords: 0, driverDroppedStackLines: 0 }; });
      fs.writeFileSync(runFile(root, "probe.jsonl"), jsonl([{ src: "driver", ev: "server-ready" }]));
      return [...withReceipt(root), "--probe", runFile(root, "probe.jsonl")];
    }, "probeComplete"],
  ];
  it.each(incomplete)("fails a zero-fault run when %s", (_name, prepare, gate) => {
    const root = writeCompletedRun();
    const result = cli(prepare(root));
    expect(result.status).toBe(1);
    const out = JSON.parse(result.stdout);
    expect(out.rawCount).toBe(0);
    expect(out.strict.result).toBe("FAIL");
    expect(out.strict.failingRunGate).toContain(gate);
  });

  it("keeps a FATAL fault row verbatim apart from the review rows", () => {
    const root = writeCompletedRun();
    const events = completedEvents();
    events.splice(1, 0, fatalRow);
    fs.writeFileSync(runFile(root, "events.jsonl"), jsonl(events));
    const out = JSON.parse(cli(withReceipt(root)).stdout);
    expect(out.fatalFaults).toEqual([expect.objectContaining({ line: 2, rawLine: JSON.stringify(fatalRow), parsed: fatalRow })]);
  });

  it("fails an unknown fault type and reports a missing receipt as not provided", () => {
    const root = makeRoot();
    const odd = fault(0, { type: "MYSTERY", local: true, path: "/x" });
    writeRun(root, [odd, shutdown], driverFor([odd]), null);
    const result = cli(baseArgs(root));
    expect(result.status).toBe(1);
    const out = JSON.parse(result.stdout);
    expect(out.rawFaults[0]).toMatchObject({ classification: "FAIL", strictImpact: "FAIL", rule: "NONE" });
    expect(out.originalExit).toBe("NOT_PROVIDED");
  });

  const inputErrors: Array<[string, (root: string, args: string[]) => string[], string]> = [
    ["a required argument is missing", (_root, args) => args.slice(2), "ARG_MISSING"],
    ["an argument is unknown", (_root, args) => [...args, "--trusted", "true"], "ARG_UNKNOWN"],
    ["the events file does not exist", (root, args) => { fs.rmSync(runFile(root, "events.jsonl")); return args; }, "INPUT_READ"],
    ["the events file is empty", (root, args) => { fs.writeFileSync(runFile(root, "events.jsonl"), ""); return args; }, "EVENTS_EMPTY"],
    ["an events line is not JSON", (root, args) => { fs.appendFileSync(runFile(root, "events.jsonl"), "{\"type\":\n"); return args; }, "EVENTS_PARSE"],
    ["an interior events line is empty", (root, args) => { fs.writeFileSync(runFile(root, "events.jsonl"), fs.readFileSync(runFile(root, "events.jsonl"), "utf8").replace("\n", "\n\n")); return args; }, "EVENTS_PARSE"],
    ["the driver lists one fault fewer", (root, args) => { rewriteJson(runFile(root, "driver-result.json"), (driver) => { (driver.reviewFaults as Row[]).pop(); }); return args; }, "FAULT_LIST_MISMATCH"],
    ["the driver lists faults in another order", (root, args) => { rewriteJson(runFile(root, "driver-result.json"), (driver) => { const list = driver.reviewFaults as Row[]; [list[0], list[1]] = [list[1], list[0]]; }); return args; }, "FAULT_LIST_MISMATCH"],
    ["a driver fault field differs", (root, args) => { rewriteJson(runFile(root, "driver-result.json"), (driver) => { (driver.reviewFaults as Row[])[18].status = 500; }); return args; }, "FAULT_LIST_MISMATCH"],
    ["the driver stage differs", (root, args) => { rewriteJson(runFile(root, "driver-result.json"), (driver) => { driver.stage = "stage-2"; }); return args; }, "STAGE_MISMATCH"],
    ["the receipt belongs to another run tree", (_root, args) => { const other = makeRoot(); fs.writeFileSync(path.join(other, "result.json"), JSON.stringify(receipt("FIXTURE_REPLAY_NOT_PROVIDER_LIVE", 2))); return [...args, "--receipt", path.join(other, "result.json")]; }, "RUN_TREE_MISMATCH"],
    ["the driver-result is from another directory", (root, args) => { fs.copyFileSync(runFile(root, "driver-result.json"), path.join(root, "driver-result.json")); return [...args.slice(0, 5), path.join(root, "driver-result.json")]; }, "RUN_TREE_MISMATCH"],
    ["a health warning line does not exist", (root, args) => [...args, "--receipt", path.join(root, "result.json"), "--health-warning", `${runFile(root, "driver-result.json")}:9999`], "HEALTH_WARNING_LINE"],
  ];
  it.each(inputErrors)("exits 2 with no classification when %s", (_name, prepare, code) => {
    const { root } = writeNineteenRowRun();
    const result = cli(prepare(root, baseArgs(root)));
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(errorCode(result.stderr)).toBe(code);
  });

  const evidenceErrors: Array<[string, (root: string, args: string[]) => string[], string]> = [
    ["the probe file cannot be parsed", (root, args) => { fs.appendFileSync(runFile(root, "probe.jsonl"), "not json\n"); return args; }, "PROBE_PARSE"],
    ["the driver declares no probe file", (root, args) => { rewriteJson(runFile(root, "driver-result.json"), (driver) => { delete driver.probe; }); return args; }, "RUN_TREE_MISMATCH"],
    ["the probe file is not the declared one", (root, args) => { fs.copyFileSync(runFile(root, "probe.jsonl"), runFile(root, "other-probe.jsonl")); return args.map((arg) => (arg === runFile(root, "probe.jsonl") ? runFile(root, "other-probe.jsonl") : arg)); }, "RUN_TREE_MISMATCH"],
    ["driver-result declares a probe file outside the run directory", (root, args) => {
      const moved = path.join(root, "private", "other-probe.jsonl");
      fs.copyFileSync(runFile(root, "probe.jsonl"), moved);
      rewriteJson(runFile(root, "driver-result.json"), (driver) => { (driver.probe as Row).file = "../other-probe.jsonl"; });
      return args.map((arg) => (arg === runFile(root, "probe.jsonl") ? moved : arg));
    }, "RUN_TREE_MISMATCH"],
    ["driver-result declares the parent as server observer directory", (root, args) => {
      const moved = path.join(root, "private", "43.jsonl");
      fs.copyFileSync(runFile(root, "server-observer/43.jsonl"), moved);
      rewriteJson(runFile(root, "driver-result.json"), (driver) => { (driver.probe as Row).serverObserverDir = ".."; });
      return args.map((arg) => (arg === runFile(root, "server-observer/43.jsonl") ? moved : arg));
    }, "RUN_TREE_MISMATCH"],
    ["the probe file is a symlink into another run", (root, args) => {
      const other = makeRoot();
      fs.copyFileSync(runFile(root, "probe.jsonl"), runFile(other, "probe.jsonl"));
      fs.rmSync(runFile(root, "probe.jsonl"));
      fs.symlinkSync(runFile(other, "probe.jsonl"), runFile(root, "probe.jsonl"));
      return args;
    }, "RUN_TREE_MISMATCH"],
    ["a server observer file is not a <pid>.jsonl file", (root, args) => {
      fs.copyFileSync(runFile(root, "server-observer/43.jsonl"), runFile(root, "server-observer/notes.jsonl"));
      return args.map((arg) => (arg === runFile(root, "server-observer/43.jsonl") ? runFile(root, "server-observer/notes.jsonl") : arg));
    }, "RUN_TREE_MISMATCH"],
    ["the server stderr is not the driver's server.stderr", (root, args) => {
      fs.copyFileSync(runFile(root, "server.stderr"), runFile(root, "other.stderr"));
      return args.map((arg) => (arg === runFile(root, "server.stderr") ? runFile(root, "other.stderr") : arg));
    }, "RUN_TREE_MISMATCH"],
    ["a health warning file is outside the run tree", (_root, args) => { const other = makeRoot(); fs.writeFileSync(path.join(other, "warning.txt"), "warning\n"); return [...args, "--health-warning", `${path.join(other, "warning.txt")}:1`]; }, "RUN_TREE_MISMATCH"],
  ];
  it.each(evidenceErrors)("exits 2 when %s", (_name, prepare, code) => {
    const { root, args } = writeCancelRun();
    const result = cli(prepare(root, args));
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(errorCode(result.stderr)).toBe(code);
  });

  it("exits 2 for fault rows without a type, with an unknown fault class, or missing from the events", () => {
    const cases: Array<[Row[], Row[], string]> = [
      [[{ at: "t", stage: "stage-1", local: true, faultClass: "REVIEW" }, shutdown], [{ local: true, duringShutdown: false }], "FAULT_TYPE_MISSING"],
      [[{ at: "t", stage: "stage-1", type: "CONSOLE", faultClass: "IGNORED" }, shutdown], [{ type: "CONSOLE", duringShutdown: false }], "FAULT_CLASS_UNKNOWN"],
      [completedEvents(), [{ type: "CONSOLE", duringShutdown: false }], "FAULT_LIST_MISMATCH"],
    ];
    for (const [events, driverFaults, code] of cases) {
      const root = makeRoot();
      writeRun(root, events, { ...driverFor([]), reviewFaults: driverFaults }, null);
      const result = cli(baseArgs(root));
      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(errorCode(result.stderr)).toBe(code);
    }
  });
});
