import { describe, expect, it } from "vitest";
import { classifyRun, type HealthWarningInput, type RawRecord, type RunEvidence } from "../scripts/lib/journeyFaultPolicy.mts";

// SYNTHETIC records only. They follow the record shapes the current fixed driver, probe and server observer emit
// (events without request ids, CDP/page records without a join key to events) and are not taken from a real run.
// Expected values are written by hand from the approved rule text and the review 1100 counterexamples.
const EVENTS = "events.jsonl";
const PROBE = "probe.jsonl";
const SERVER = "server-observer/43.jsonl";
const CORP = "/api/public/disclosure/corpcodes/status";
const rec = (file: string, line: number, value: Record<string, unknown>): RawRecord => ({ ref: { file, line }, value });
const at = (run: RunEvidence, line: number) => run.events.find((record) => record.ref.line === line)!;
const cleanupStack = [
  "Error: probe304-abort-listener",
  "at useThing.useEffect (webpack-internal:///(app-pages-browser)/./src/components/useThing.ts:60:32)",
  "at commitHookEffectListUnmount (webpack-internal:///(app-pages-browser)/./node_modules/react-dom/cjs/react-dom-client.development.js:13767:17)",
];
const receipt = (exit: number, dataLabel = "SYNTHETIC_NEW_EMPTY_STATE") => rec("result.json", 352, {
  data_label: dataLabel,
  source_access: false,
  phases: [
    { phase: "db-prepare", argv: ["/usr/bin/bwrap", "--unshare-net"], timed_out: false, outer_reaped: true, init_exited: true, outer_exit: 0, status_fd: { exit_code: 0, malformed: false }, infrastructure_ok: true },
    { phase: "journey", argv: ["/usr/bin/bwrap", "--unshare-net", "--", "/opt/node/bin/node", "driver.mjs"], timed_out: false, outer_reaped: true, init_exited: true, outer_exit: exit, status_fd: { exit_code: exit, malformed: false }, infrastructure_ok: true },
  ],
});
const journey = (run: RunEvidence) => (run.receipt!.value.phases as Array<Record<string, unknown>>)[1];
const driver = (faults: RawRecord[], probe: Record<string, unknown> | null, actions = 1) => rec("driver-result.json", 1, {
  stage: "s",
  actions,
  status: faults.length > 0 ? "OBSERVED_WITH_UNRESOLVED_FAULTS" : "STAGE_OBSERVED_COMPLETE",
  humanReportedComplete: true,
  browserClosed: true,
  observationFault: null,
  reviewFaults: faults.map((fault) => fault.value),
  ...(probe ? { probe } : {}),
});
// Lifecycle records the fixed driver writes: numbered observations ("initial", then "after-<action>") and commands.
const observation = (line: number, id: string, reason: string) => rec(EVENTS, line, { type: "OBSERVATION", id, reason, missing: [] });
const command = (line: number, sequence: number, action: string) => rec(EVENTS, line, { type: "COMMAND", sequence, action });
const probeCounters = (lines: number) => ({ file: "probe.jsonl", serverObserverDir: "server-observer", lines, writeErrors: 0, cdpAttached: 1, cdpAttachErrors: 0, pageRecords: 0, unparsedPageRecords: 0, driverDroppedStackLines: 0 });

// A completed zero-fault run in the supported contract: the only positive strict case.
function completedRun(): RunEvidence {
  return {
    runId: "synthetic-complete",
    faults: [],
    fatalFaults: [],
    events: [
      observation(1, "0001", "initial"),
      command(2, 1, "click"),
      rec(EVENTS, 3, { type: "JSON_RESULT", local: true, path: "/api/planning/v2/profiles", method: "POST", status: 201, ok: true, financialResultOnly: {}, savedIds: { "data.id": "p-1" } }),
      observation(4, "0002", "after-click"),
      command(5, 2, "stop"),
      rec(EVENTS, 6, { type: "OWNED_SERVER_SHUTDOWN", code: null, signal: "SIGTERM" }),
    ],
    driverResult: driver([], null),
    receipt: receipt(0),
    probe: null,
    server: null,
    serverStderr: null,
    healthWarnings: [],
  };
}

// A cancel with every native record the current collectors can write, including an app cleanup abort.
function cancelRun(): RunEvidence {
  const fault = rec(EVENTS, 3, { type: "REQUEST_FAILED", method: "GET", local: true, path: "/api/x", error: "net::ERR_ABORTED", faultClass: "REVIEW" });
  const probe = [
    rec(PROBE, 1, { src: "cdp", ev: "attached", pageId: 1 }),
    rec(PROBE, 2, { src: "cdp", ev: "Network.requestWillBeSent", requestId: "154.27", pageId: 1, method: "GET", path: "/api/x" }),
    rec(PROBE, 3, { src: "page", pageId: 1, kind: "fetch", doc: 100.5, top: true, request: 1, signal: 1, signalState: "own-data", signalAlreadyAborted: false, path: "/api/x" }),
    rec(PROBE, 4, { src: "page", pageId: 1, kind: "abort", doc: 100.5, top: true, signal: 1, requests: [1], stack: cleanupStack, stackFrames: 3, stackOmitted: 0 }),
    rec(PROBE, 5, { src: "cdp", ev: "Network.loadingFailed", requestId: "154.27", pageId: 1, errorText: "net::ERR_ABORTED", canceled: true }),
  ];
  return {
    runId: "synthetic-cancel",
    faults: [fault],
    fatalFaults: [],
    events: [
      rec(EVENTS, 1, { type: "REQUEST", method: "GET", local: true, path: "/api/x", resource: "fetch" }),
      observation(2, "0001", "initial"),
      fault,
      rec(EVENTS, 4, { type: "JSON_RESULT", local: true, path: "/api/x", method: "GET", status: 200, ok: true, financialResultOnly: {} }),
      command(5, 1, "click"),
      rec(EVENTS, 6, { type: "JSON_RESULT", local: true, path: "/api/planning/v2/profiles", method: "POST", status: 201, ok: true, financialResultOnly: {}, savedIds: { "data.id": "p-1" } }),
      observation(7, "0002", "after-click"),
      command(8, 2, "stop"),
      rec(EVENTS, 9, { type: "OWNED_SERVER_SHUTDOWN", code: null, signal: "SIGTERM" }),
    ],
    driverResult: driver([fault], { ...probeCounters(5), pageRecords: 2 }),
    receipt: receipt(2),
    probe,
    server: [
      rec(SERVER, 1, { ev: "request-start", id: "43-r1", socketId: "43-s1", method: "GET", path: "/api/x" }),
      rec(SERVER, 2, { ev: "request-aborted", id: "43-r1", statusCode: 200, headersSent: false, writableFinished: false }),
      rec(SERVER, 3, { ev: "request-close", id: "43-r1", statusCode: 200, headersSent: false, writableFinished: false }),
      rec(SERVER, 4, { ev: "process-exit", code: 143 }),
    ],
    serverStderr: [{ ref: { file: "server.stderr", line: 1 }, text: "ready" }],
    healthWarnings: [],
  };
}

// The J-shaped corpcodes 409: HTTP_ERROR without method, RESPONSE and JSON_RESULT without body fields, console row.
function corpRun(): RunEvidence {
  const http = rec(EVENTS, 4, { type: "HTTP_ERROR", local: true, path: CORP, status: 409, faultClass: "REVIEW" });
  const consoleError = rec(EVENTS, 5, { type: "CONSOLE", level: "error", message: "Failed to load resource: the server responded with a status of 409 (Conflict)", location: { local: true, path: CORP }, faultClass: "REVIEW" });
  return {
    runId: "synthetic-corp",
    faults: [http, consoleError],
    fatalFaults: [],
    events: [
      observation(1, "0001", "initial"),
      rec(EVENTS, 2, { type: "REQUEST", method: "GET", local: true, path: CORP, resource: "fetch" }),
      rec(EVENTS, 3, { type: "RESPONSE", method: "GET", local: true, path: CORP, status: 409 }),
      http,
      consoleError,
      rec(EVENTS, 6, { type: "JSON_RESULT", local: true, path: CORP, status: 409, financialResultOnly: {} }),
      command(7, 1, "click"),
      observation(8, "0002", "after-click"),
      command(9, 2, "stop"),
      rec(EVENTS, 10, { type: "OWNED_SERVER_SHUTDOWN", code: null, signal: "SIGTERM" }),
    ],
    driverResult: driver([http, consoleError], null),
    receipt: receipt(2),
    probe: null,
    server: null,
    serverStderr: null,
    healthWarnings: [],
  };
}

const statuses = (conditions: Record<string, { status: string }>) => Object.fromEntries(Object.entries(conditions).map(([name, value]) => [name, value.status]));

describe("run gate: a PASS needs a completed, drained run whose exits agree with the faults", () => {
  it("passes a completed synthetic run with zero faults", () => {
    const result = classifyRun(completedRun());
    expect(result.rawCount).toBe(0);
    expect(result.runGate.status).toBe("MET");
    expect(result.runGate.conditionResults.probeComplete.note).toBe("this producer declares no probe");
    expect(result.strict).toEqual({ result: "PASS", failingRows: [], failingHealthWarnings: [], failingRunGate: [] });
  });

  it.each([["null", null], ["an array", []], ["a string", "broken"]])("fails a zero-fault run whose driver-result probe is %s", (_name, value) => {
    const run = completedRun();
    run.driverResult.value.probe = value;
    const result = classifyRun(run);
    expect(result.runGate.conditionResults.probeComplete.status).toBe("NOT_MET");
    expect(result.strict.result).toBe("FAIL");
    expect(result.strict.failingRunGate).toEqual(["probeComplete"]);
  });

  it("passes a completed zero-fault run whose declared probe is complete", () => {
    const run = completedRun();
    run.driverResult.value.probe = probeCounters(1);
    run.probe = [rec(PROBE, 1, { src: "driver", ev: "server-ready" })];
    const result = classifyRun(run);
    expect(result.runGate.conditionResults.probeComplete.status).toBe("MET");
    expect(result.strict.result).toBe("PASS");
  });

  const cases: Array<[string, (run: RunEvidence) => void, string, string]> = [
    ["no receipt was given", (run) => { run.receipt = null; }, "receiptJourneyComplete", "NO_EVIDENCE"],
    ["the journey infrastructure failed", (run) => { journey(run).infrastructure_ok = false; }, "receiptJourneyComplete", "NOT_MET"],
    ["the journey timed out", (run) => { journey(run).timed_out = true; }, "receiptJourneyComplete", "NOT_MET"],
    ["the journey process was not reaped", (run) => { journey(run).outer_reaped = false; }, "receiptJourneyComplete", "NOT_MET"],
    ["the status report is malformed", (run) => { (journey(run).status_fd as Record<string, unknown>).malformed = true; }, "receiptJourneyComplete", "NOT_MET"],
    ["outer and status exits differ", (run) => { (journey(run).status_fd as Record<string, unknown>).exit_code = 1; }, "receiptJourneyComplete", "CONFLICT"],
    ["the receipt has two journey phases", (run) => { (run.receipt!.value.phases as unknown[]).push(journey(run)); }, "receiptJourneyComplete", "CONFLICT"],
    ["the exit says faults but none were recorded", (run) => { journey(run).outer_exit = 2; (journey(run).status_fd as Record<string, unknown>).exit_code = 2; }, "exitConsistent", "NOT_MET"],
    ["the driver stopped on error", (run) => { run.driverResult.value.status = "STOPPED_ON_ERROR"; }, "driverComplete", "NOT_MET"],
    ["the driver status claims unresolved faults without rows", (run) => { run.driverResult.value.status = "OBSERVED_WITH_UNRESOLVED_FAULTS"; }, "driverComplete", "NOT_MET"],
    ["the journey was not reported complete", (run) => { run.driverResult.value.humanReportedComplete = false; }, "driverComplete", "NOT_MET"],
    ["the browser was not closed", (run) => { run.driverResult.value.browserClosed = false; }, "driverComplete", "NOT_MET"],
    ["the driver recorded an observation fault", (run) => { run.driverResult.value.observationFault = { type: "SERVER_EXIT" }; }, "driverComplete", "NOT_MET"],
    ["a FATAL fault row exists", (run) => { run.fatalFaults.push(rec(EVENTS, 9, { type: "SERVER_EXIT", code: 1, signal: null, faultClass: "FATAL" })); }, "noFatalFault", "NOT_MET"],
    ["the driver stopped on an error event", (run) => { run.events.splice(2, 0, rec(EVENTS, 9, { type: "STOP_ON_ERROR", name: "Error" })); }, "noDriverErrorEvents", "NOT_MET"],
    ["review snapshot capture hit its cap", (run) => { run.events.splice(2, 0, rec(EVENTS, 9, { type: "REVIEW_SNAPSHOT_CAP_REACHED", max: 8 })); }, "noDriverErrorEvents", "NOT_MET"],
    ["the events end before the server shutdown", (run) => { run.events.pop(); }, "eventsDrained", "NO_EVIDENCE"],
    ["events continue after the server shutdown", (run) => { run.events.push(observation(7, "0003", "requested")); }, "eventsDrained", "NOT_MET"],
    ["a save answered HTTP 200 with ok false", (run) => { Object.assign(at(run, 3).value, { status: 200, ok: false }); }, "noRecordedResultFailure", "NOT_MET"],
    ["a data change answered without a 2xx status", (run) => { at(run, 3).value.status = 409; }, "noRecordedResultFailure", "NOT_MET"],
    ["the declared probe was not given", (run) => { run.driverResult.value.probe = probeCounters(1); }, "probeComplete", "NO_EVIDENCE"],
    ["the declared probe lost a write", (run) => {
      run.driverResult.value.probe = { ...probeCounters(1), writeErrors: 1 };
      run.probe = [rec(PROBE, 1, { src: "driver", ev: "server-ready" })];
    }, "probeComplete", "NOT_MET"],
    ["the declared probe file lacks lines", (run) => {
      run.driverResult.value.probe = probeCounters(3);
      run.probe = [rec(PROBE, 1, { src: "driver", ev: "server-ready" })];
    }, "probeComplete", "CONFLICT"],
    ["probe records were given without a declaration", (run) => { run.probe = [rec(PROBE, 1, { src: "driver", ev: "server-ready" })]; }, "probeComplete", "CONFLICT"],
    ["only the shutdown row is left", (run) => { run.events = [run.events[5]]; }, "lifecycleRecorded", "NO_EVIDENCE"],
    ["the head of the events was cut", (run) => { run.events.splice(0, 2); }, "lifecycleRecorded", "NOT_MET"],
    ["the first observation is not the initial one", (run) => { at(run, 1).value.reason = "requested"; }, "lifecycleRecorded", "NOT_MET"],
    ["a command is missing in the middle", (run) => { run.events.splice(1, 1); }, "lifecycleRecorded", "NOT_MET"],
    ["the after-action observation is missing", (run) => { run.events.splice(3, 1); }, "lifecycleRecorded", "CONFLICT"],
    ["no stop command was recorded", (run) => { run.events.splice(4, 1); }, "lifecycleRecorded", "NO_EVIDENCE"],
    ["a command follows the stop", (run) => { run.events.splice(5, 0, command(19, 3, "click")); }, "lifecycleRecorded", "NOT_MET"],
    ["the driver action count disagrees", (run) => { run.driverResult.value.actions = 3; }, "lifecycleRecorded", "CONFLICT"],
  ];
  it.each(cases)("fails a zero-fault run when %s", (_name, mutate, condition, status) => {
    const run = completedRun();
    mutate(run);
    const result = classifyRun(run);
    expect(result.runGate.conditionResults[condition].status).toBe(status);
    expect(result.runGate.status).toBe("NOT_MET");
    expect(result.strict.result).toBe("FAIL");
    expect(result.strict.failingRunGate).toContain(condition);
  });
});

describe("rule 1: no EXPECTED_CANCEL without a native same-request link", () => {
  it("keeps a cancel with every native record UNRESOLVED and names the observed cleanup only as a candidate", () => {
    const result = classifyRun(cancelRun());
    const row = result.rows[0];
    expect(row).toMatchObject({ index: 0, ref: { file: EVENTS, line: 3 }, rule: "RULE1_CANCEL", classification: "UNRESOLVED", strictImpact: "FAIL" });
    expect(statuses(row.conditionResults)).toEqual({
      exactAbortError: "MET",
      readOnlyGet: "MET",
      instrumentationComplete: "MET",
      sameRequestCdpCanceled: "NO_EVIDENCE",
      appCleanupCausality: "NO_EVIDENCE",
      noServerPriorFailure: "NO_EVIDENCE",
      observationCollected: "MET",
      functionalConsistency: "NO_EVIDENCE",
    });
    expect(row.conditionResults.sameRequestCdpCanceled.evidenceRefs).toEqual([{ file: PROBE, line: 2 }, { file: PROBE, line: 5 }]);
    expect(row.conditionResults.appCleanupCausality.evidenceRefs).toEqual([{ file: PROBE, line: 3 }, { file: PROBE, line: 4 }]);
    expect(row.conditionResults.noServerPriorFailure.evidenceRefs).toEqual([{ file: SERVER, line: 1 }]);
    expect(row.conditionResults.functionalConsistency.evidenceRefs).toEqual([{ file: EVENTS, line: 6 }]);
    expect(result.runGate.status).toBe("MET");
    expect(result.counts).toEqual({ EXPECTED_CANCEL: 0, EXPECTED_DATA_ABSENCE: 0, UNRESOLVED: 1, FAIL: 0 });
    expect(result.strict).toEqual({ result: "FAIL", failingRows: [0], failingHealthWarnings: [], failingRunGate: [] });
  });

  it("does not accept join fields the current collectors never write", () => {
    const run = cancelRun();
    Object.assign(run.faults[0].value, { requestId: "154.27", expected: true, cleanup: true, trusted: true, classification: "EXPECTED_CANCEL" });
    run.probe![2].value.cdpRequestId = "154.27";
    run.probe![3].value.appCleanup = true;
    run.server![0].value.cdpRequestId = "154.27";
    const row = classifyRun(run).rows[0];
    expect(row.conditionResults.sameRequestCdpCanceled.status).toBe("NO_EVIDENCE");
    expect(row.conditionResults.sameRequestCdpCanceled.note).toContain("requestId");
    expect(row.conditionResults.appCleanupCausality.status).toBe("NO_EVIDENCE");
    expect(row.conditionResults.appCleanupCausality.note).toContain("cdpRequestId");
    expect(row.conditionResults.noServerPriorFailure.status).toBe("NO_EVIDENCE");
    expect(row).toMatchObject({ classification: "UNRESOLVED", strictImpact: "FAIL" });
  });

  const cases: Array<[string, (run: RunEvidence) => void, string, string]> = [
    ["the error is not an abort", (run) => { run.faults[0].value.error = "net::ERR_FAILED"; }, "exactAbortError", "NOT_MET"],
    ["the probe file is missing", (run) => { run.probe = null; }, "instrumentationComplete", "NO_EVIDENCE"],
    ["the driver has no probe counters", (run) => { delete run.driverResult.value.probe; }, "instrumentationComplete", "NO_EVIDENCE"],
    ["a probe write failed", (run) => { (run.driverResult.value.probe as Record<string, unknown>).writeErrors = 1; }, "instrumentationComplete", "NOT_MET"],
    ["the probe file lacks lines the driver wrote", (run) => { (run.driverResult.value.probe as Record<string, unknown>).lines = 9; }, "instrumentationComplete", "CONFLICT"],
    ["the CDP failure is on another page", (run) => { run.probe![4].value.pageId = 99; }, "sameRequestCdpCanceled", "NOT_MET"],
    ["the CDP failure is not canceled", (run) => { run.probe![4].value.canceled = false; }, "sameRequestCdpCanceled", "NOT_MET"],
    ["the CDP request has no page id", (run) => { delete run.probe![1].value.pageId; }, "sameRequestCdpCanceled", "NOT_MET"],
    ["fetch and abort have no page, document or top identity", (run) => {
      for (const record of [run.probe![2], run.probe![3]]) { delete record.value.pageId; delete record.value.doc; delete record.value.top; }
    }, "appCleanupCausality", "NOT_MET"],
    ["the abort belongs to another document", (run) => { run.probe![3].value.doc = 200.5; }, "appCleanupCausality", "NOT_MET"],
    ["the fetch has no signal", (run) => { run.probe![2].value.signal = null; }, "appCleanupCausality", "NOT_MET"],
    ["the signal was already aborted", (run) => { run.probe![2].value.signalAlreadyAborted = true; }, "appCleanupCausality", "NOT_MET"],
    ["the abort stack has no effect cleanup frame", (run) => { run.probe![3].value.stack = [cleanupStack[0], cleanupStack[1]]; }, "appCleanupCausality", "NOT_MET"],
    ["the abort stack has no app source frame", (run) => { run.probe![3].value.stack = [cleanupStack[0], cleanupStack[2]]; }, "appCleanupCausality", "NOT_MET"],
    ["abort stack lines were omitted", (run) => { run.probe![3].value.stackOmitted = 1; }, "appCleanupCausality", "NOT_MET"],
    ["the abort stack was skipped", (run) => { run.probe![3].value.stack = null; run.probe![3].value.stackSkipped = "prepareStackTrace-present"; }, "appCleanupCausality", "NOT_MET"],
    ["an incomplete probe has no cleanup candidate", (run) => { (run.driverResult.value.probe as Record<string, unknown>).writeErrors = 1; run.probe![3].value.stackOmitted = 1; }, "appCleanupCausality", "NO_EVIDENCE"],
    ["the server observer is missing", (run) => { run.server = null; }, "noServerPriorFailure", "NO_EVIDENCE"],
    ["the server observer was disabled", (run) => { run.serverStderr!.push({ ref: { file: "server.stderr", line: 2 }, text: "[server-observer] disabled pid=43 code=EEXIST" }); }, "noServerPriorFailure", "NO_EVIDENCE"],
    ["the run recorded a page error", (run) => { run.events.splice(3, 0, rec(EVENTS, 19, { type: "PAGEERROR", message: "boom" })); }, "observationCollected", "NOT_MET"],
    ["a later observation misses artifacts", (run) => { at(run, 7).value.missing = ["screenshot"]; }, "observationCollected", "NOT_MET"],
    ["no observation follows the fault", (run) => { run.events.splice(6, 1); }, "observationCollected", "NO_EVIDENCE"],
    ["a save failed", (run) => { Object.assign(at(run, 6).value, { status: 500, ok: false }); }, "functionalConsistency", "NOT_MET"],
    ["a read result reported failure", (run) => { at(run, 4).value.ok = false; }, "functionalConsistency", "NOT_MET"],
  ];
  it.each(cases)("records the downgrade when %s and stays UNRESOLVED", (_name, mutate, condition, status) => {
    const run = cancelRun();
    mutate(run);
    const row = classifyRun(run).rows[0];
    expect(row.conditionResults[condition].status).toBe(status);
    expect(row).toMatchObject({ classification: "UNRESOLVED", strictImpact: "FAIL" });
  });

  it("fails a data-changing cancel", () => {
    const run = cancelRun();
    run.faults[0].value.method = "POST";
    const row = classifyRun(run).rows[0];
    expect(row.conditionResults.readOnlyGet.status).toBe("NOT_MET");
    expect(row).toMatchObject({ classification: "FAIL", strictImpact: "FAIL" });
  });
});

describe("rule 2: no EXPECTED_DATA_ABSENCE without a read request, a linked body and a linked console row", () => {
  it("fails the J-shaped 409 and its console row and keeps both rows", () => {
    const result = classifyRun(corpRun());
    expect(result.rawCount).toBe(2);
    const [http, consoleRow] = result.rows;
    expect(http).toMatchObject({ rule: "RULE2_DATA_ABSENCE", classification: "FAIL", strictImpact: "FAIL" });
    expect(statuses(http.conditionResults)).toEqual({
      readOnlyGet: "NO_EVIDENCE",
      syntheticOfflineRun: "MET",
      responseBodyLinked: "NO_EVIDENCE",
      bodyErrorIndexMissing: "NO_EVIDENCE",
      existsFalse: "NO_EVIDENCE",
      observationCollected: "MET",
      functionalConsistency: "NO_EVIDENCE",
    });
    expect(http.conditionResults.responseBodyLinked.evidenceRefs).toEqual([{ file: EVENTS, line: 3 }, { file: EVENTS, line: 6 }]);
    expect(consoleRow).toMatchObject({ rule: "RULE2_DATA_ABSENCE", classification: "FAIL", strictImpact: "FAIL" });
    expect(statuses(consoleRow.conditionResults)).toEqual({ errorKind409: "MET", linkedToExpectedResponse: "NO_EVIDENCE" });
    expect(result.counts).toEqual({ EXPECTED_CANCEL: 0, EXPECTED_DATA_ABSENCE: 0, UNRESOLVED: 0, FAIL: 2 });
    expect(result.strict).toEqual({ result: "FAIL", failingRows: [0, 1], failingHealthWarnings: [], failingRunGate: [] });
  });

  it("does not accept an invented body record or response ids", () => {
    const run = corpRun();
    Object.assign(run.faults[0].value, { method: "GET", requestId: "7.1" });
    run.faults[1].value.requestId = "7.1";
    run.events.splice(5, 0, rec(EVENTS, 19, { type: "RESPONSE_BODY", requestId: "7.1", path: CORP, status: 409, body: { error: "CORPCODES_INDEX_MISSING", exists: false } }));
    const [http, consoleRow] = classifyRun(run).rows;
    expect(http.conditionResults.readOnlyGet.status).toBe("MET");
    expect(http.conditionResults.responseBodyLinked.status).toBe("NO_EVIDENCE");
    expect(http.conditionResults.responseBodyLinked.note).toContain("RESPONSE_BODY");
    expect(http.conditionResults.bodyErrorIndexMissing.status).toBe("NO_EVIDENCE");
    expect(http.classification).toBe("FAIL");
    expect(consoleRow.conditionResults.linkedToExpectedResponse.status).toBe("NO_EVIDENCE");
    expect(consoleRow.classification).toBe("FAIL");
  });

  it("fails a data-changing 409 request", () => {
    const run = corpRun();
    run.faults[0].value.method = "POST";
    const http = classifyRun(run).rows[0];
    expect(http.conditionResults.readOnlyGet.status).toBe("NOT_MET");
    expect(http.classification).toBe("FAIL");
  });

  it("does not treat a console error of another kind as the 409 companion", () => {
    const run = corpRun();
    run.faults[1].value.message = "Failed to load resource: the server responded with a status of 403 (Forbidden)";
    const consoleRow = classifyRun(run).rows[1];
    expect(consoleRow).toMatchObject({ rule: "NONE", classification: "FAIL" });
    expect(consoleRow.conditionResults.errorKind409.status).toBe("NOT_MET");
  });

  const receiptCases: Array<[string, (run: RunEvidence) => void, string]> = [
    ["the run is a fixture replay", (run) => { run.receipt!.value.data_label = "FIXTURE_REPLAY_NOT_PROVIDER_LIVE"; }, "NOT_MET"],
    ["the journey was not network isolated", (run) => { journey(run).argv = ["/usr/bin/bwrap", "--", "node"]; }, "NOT_MET"],
    ["source access is not denied", (run) => { run.receipt!.value.source_access = true; }, "NOT_MET"],
    ["no receipt was given", (run) => { run.receipt = null; }, "NO_EVIDENCE"],
  ];
  it.each(receiptCases)("records the synthetic offline condition when %s", (_name, mutate, status) => {
    const run = corpRun();
    mutate(run);
    const http = classifyRun(run).rows[0];
    expect(http.conditionResults.syntheticOfflineRun.status).toBe(status);
    expect(http.classification).toBe("FAIL");
  });

  it("never excepts a 403 or a corpcodes 500", () => {
    const forbidden = corpRun();
    Object.assign(forbidden.faults[0].value, { path: "/api/settings/backup/export", status: 403 });
    expect(classifyRun(forbidden).rows[0]).toMatchObject({ rule: "NONE", classification: "FAIL", strictImpact: "FAIL" });
    const server = corpRun();
    server.faults[0].value.status = 500;
    expect(classifyRun(server).rows[0]).toMatchObject({ rule: "NONE", classification: "FAIL", strictImpact: "FAIL" });
  });
});

describe("snapshot health warnings: listed apart from raw faults, never excepted from screen text alone", () => {
  const warning = (text: string, sourceKind: HealthWarningInput["sourceKind"] = "SCREEN_TEXT", line = 173): HealthWarningInput => ({ ref: { file: "frames/0015.text.txt", line }, text, sourceKind });

  it("keeps a screen-text warning UNRESOLVED, outside the raw count, and blocks a PASS", () => {
    const run = completedRun();
    run.healthWarnings = [warning("No saved latest assumptions snapshot; defaults were used.")];
    const result = classifyRun(run);
    expect(result.rawCount).toBe(0);
    expect(result.healthWarnings[0]).toMatchObject({ classification: "UNRESOLVED", countedInRaw: false, sourceKind: "SCREEN_TEXT" });
    expect(statuses(result.healthWarnings[0].conditionResults)).toEqual({ syntheticOfflineRun: "MET", sourceVerified: "NO_EVIDENCE", noBlockingConflict: "MET" });
    expect(result.strict).toEqual({ result: "FAIL", failingRows: [], failingHealthWarnings: [0], failingRunGate: [] });
  });

  const cases: Array<[string, (run: RunEvidence) => void, string, string]> = [
    ["the cited line is structured HTTP error data", (run) => { run.healthWarnings = [warning(JSON.stringify({ code: "SNAPSHOT_MISSING", type: "HTTP_ERROR", status: 500 }))]; }, "noBlockingConflict", "CONFLICT"],
    ["the assumptions API returned an HTTP error", (run) => { run.events.splice(1, 0, rec(EVENTS, 9, { type: "HTTP_ERROR", local: true, path: "/api/planning/v2/assumptions/snapshots", status: 500 })); }, "noBlockingConflict", "CONFLICT"],
    ["the source is not a frame text line of this run", (run) => { run.healthWarnings = [warning("No saved latest assumptions snapshot.", "OTHER")]; }, "sourceVerified", "NOT_MET"],
    ["the run is not synthetic", (run) => { run.receipt!.value.data_label = "FIXTURE_REPLAY_NOT_PROVIDER_LIVE"; }, "syntheticOfflineRun", "NOT_MET"],
  ];
  it.each(cases)("fails the warning when %s", (_name, mutate, condition, status) => {
    const run = completedRun();
    run.healthWarnings = [warning("No saved latest assumptions snapshot; defaults were used.")];
    mutate(run);
    const result = classifyRun(run);
    expect(result.healthWarnings[0].conditionResults[condition].status).toBe(status);
    expect(result.healthWarnings[0].classification).toBe("FAIL");
    expect(result.rawCount).toBe(0);
    expect(result.strict.result).toBe("FAIL");
  });
});

describe("rows outside both rules", () => {
  it("fails unknown fault types and keeps every row in order with counts", () => {
    const run = cancelRun();
    const pageError = rec(EVENTS, 20, { type: "PAGEERROR", message: "x", faultClass: "REVIEW" });
    const repeat = rec(EVENTS, 21, { ...run.faults[0].value });
    run.faults.push(pageError, repeat);
    const result = classifyRun(run);
    expect(result.rawCount).toBe(3);
    expect(result.rows.map((row) => [row.index, row.ref.line, row.classification])).toEqual([[0, 3, "UNRESOLVED"], [1, 20, "FAIL"], [2, 21, "UNRESOLVED"]]);
    expect(result.counts).toEqual({ EXPECTED_CANCEL: 0, EXPECTED_DATA_ABSENCE: 0, UNRESOLVED: 2, FAIL: 1 });
    expect(result.strict.failingRows).toEqual([0, 1, 2]);
  });
});
