// Pure #304 journey fault policy. Every recorded review fault stays a row; only the two approved rules can
// except a row, and only when each condition is proven from raw records of the current collector contract.
//
// Current contract (fixed driver, probe and server observer; read, never extended here):
// - events rows carry no request id. HTTP_ERROR rows carry no method; JSON_RESULT rows carry no body.error/exists.
// - probe CDP records carry a CDP requestId and pageId; page fetch/abort records carry pageId, doc, top, request and
//   signal. No field joins an events row, a CDP request, a page fetch and a server request to each other.
// - server observer records carry their own request id only.
// So the same-request conditions of rule 1 and the body/console links of rule 2 can at best be NO_EVIDENCE today.
// Fields the collectors do not emit (requestId or cdpRequestId on rows, page or server records, RESPONSE_BODY
// records) are ignored and named in the notes. Native records that share only method/path are listed as candidates;
// URL, time order and claim fields (expected, cleanup, trusted, classification) never link or prove anything.

export type EvidenceRef = { file: string; line: number };
export type RawRecord = { ref: EvidenceRef; value: Record<string, unknown> };
export type TextLine = { ref: EvidenceRef; text: string };
export type HealthWarningSource = "SCREEN_TEXT" | "OTHER";
export type HealthWarningInput = TextLine & { sourceKind: HealthWarningSource };
export type ConditionStatus = "MET" | "NOT_MET" | "NO_EVIDENCE" | "CONFLICT";
export type ConditionResult = { status: ConditionStatus; evidenceRefs: EvidenceRef[]; note: string };
export type Classification = "EXPECTED_CANCEL" | "EXPECTED_DATA_ABSENCE" | "UNRESOLVED" | "FAIL";
export type Rule = "RULE1_CANCEL" | "RULE2_DATA_ABSENCE" | "NONE";
export type StrictImpact = "EXCEPTED" | "FAIL";

export type RunEvidence = {
  runId: string;
  // REVIEW fault rows in recorded order (they must equal driver-result reviewFaults).
  faults: RawRecord[];
  // FATAL fault rows; the driver keeps them out of reviewFaults and they always fail the run gate.
  fatalFaults: RawRecord[];
  // Every events row, faults included, in recorded order.
  events: RawRecord[];
  driverResult: RawRecord;
  receipt: RawRecord | null;
  probe: RawRecord[] | null;
  server: RawRecord[] | null;
  serverStderr: TextLine[] | null;
  // Cited raw lines; listed separately and never added to the raw fault count.
  healthWarnings: HealthWarningInput[];
};

export type FaultRow = {
  index: number;
  ref: EvidenceRef;
  rule: Rule;
  classification: Classification;
  strictImpact: StrictImpact;
  conditionResults: Record<string, ConditionResult>;
  evidenceRefs: EvidenceRef[];
};

export type HealthWarningRow = {
  index: number;
  ref: EvidenceRef;
  text: string;
  sourceKind: HealthWarningSource;
  classification: "UNRESOLVED" | "FAIL";
  countedInRaw: false;
  conditionResults: Record<string, ConditionResult>;
};

export type RunClassification = {
  runId: string;
  rawCount: number;
  rows: FaultRow[];
  healthWarnings: HealthWarningRow[];
  runGate: { status: "MET" | "NOT_MET"; conditionResults: Record<string, ConditionResult> };
  counts: Record<Classification, number>;
  strict: { result: "PASS" | "FAIL"; failingRows: number[]; failingHealthWarnings: number[]; failingRunGate: string[] };
};

export const CORPCODES_STATUS_PATH = "/api/public/disclosure/corpcodes/status";
export const ASSUMPTIONS_API_PREFIX = "/api/planning/v2/assumptions";
const ABORT_ERROR = "net::ERR_ABORTED";
const ZERO_PROBE_COUNTERS = ["writeErrors", "cdpAttachErrors", "unparsedPageRecords", "driverDroppedStackLines"];
const EFFECT_CLEANUP_FRAME = /\b(commitHookEffectListUnmount|commitHookPassiveUnmountEffects|commitHookLayoutUnmountEffects|safelyCallDestroy)\b/;
const OBSERVER_DISABLED = "[server-observer] disabled";
const UNSUPPORTED_JOIN_FIELDS = ["requestId", "cdpRequestId", "responseId", "correlationId"];
const DRIVER_ERROR_EVENTS = ["STOP_ON_ERROR", "OBSERVATION_ERROR", "CAPTURE_ERROR", "BROWSER_CLOSE_ERROR", "SERVER_START_ERROR", "UNEXPECTED_DIALOG", "DIALOG_HANDLE_ERROR", "REVIEW_SNAPSHOT_CAP_REACHED"];
const MUTATING_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
const CONFLICT_409 = /status of 409 \(Conflict\)/;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const result = (status: ConditionStatus, evidenceRefs: EvidenceRef[], note: string): ConditionResult => ({ status, evidenceRefs, note });
const refs = (records: Array<{ ref: EvidenceRef }>) => records.map((record) => record.ref);
const allMet = (conditions: Record<string, ConditionResult>) => Object.values(conditions).every((condition) => condition.status === "MET");
const ofType = (run: RunEvidence, type: string) => run.events.filter((record) => record.value.type === type);

function ignoredJoinFields(records: RawRecord[]) {
  const names = new Set<string>();
  for (const record of records) for (const name of UNSUPPORTED_JOIN_FIELDS) if (name in record.value) names.add(name);
  for (const record of records) if (record.value.type === "RESPONSE_BODY") names.add("RESPONSE_BODY records");
  return names.size > 0 ? ` Ignored, not emitted by the current collectors: ${[...names].join(", ")}.` : "";
}

function exactAbortError(fault: RawRecord): ConditionResult {
  const error = fault.value.error;
  if (typeof error !== "string") return result("NO_EVIDENCE", [fault.ref], "raw fault has no error text");
  return error === ABORT_ERROR ? result("MET", [fault.ref], ABORT_ERROR) : result("NOT_MET", [fault.ref], `error is ${error}`);
}

function readOnlyGet(fault: RawRecord): ConditionResult {
  const method = fault.value.method;
  if (typeof method !== "string") return result("NO_EVIDENCE", [fault.ref], "raw fault row records no method; a read request is not shown");
  return method === "GET" ? result("MET", [fault.ref], "GET") : result("NOT_MET", [fault.ref], `${method} may change data`);
}

// Probe completeness from the driver's own counters; the probe file must hold exactly the lines the driver wrote.
function instrumentationComplete(run: RunEvidence): ConditionResult {
  const driverRef = [run.driverResult.ref];
  if (!run.probe) return result("NO_EVIDENCE", driverRef, "probe records not given");
  const counters = run.driverResult.value.probe;
  if (!isObject(counters)) return result("NO_EVIDENCE", driverRef, "driver-result has no probe counters");
  for (const name of [...ZERO_PROBE_COUNTERS, "cdpAttached", "lines"]) {
    if (!isNumber(counters[name])) return result("NO_EVIDENCE", driverRef, `probe counter ${name} missing`);
  }
  for (const name of ZERO_PROBE_COUNTERS) {
    if (counters[name] !== 0) return result("NOT_MET", driverRef, `probe counter ${name} is ${String(counters[name])}`);
  }
  if ((counters.cdpAttached as number) < 1) return result("NOT_MET", driverRef, "CDP was not attached");
  if (counters.lines !== run.probe.length) return result("CONFLICT", driverRef, `driver wrote ${String(counters.lines)} probe lines, ${run.probe.length} given`);
  return result("MET", driverRef, "probe counters complete and probe line count matches");
}

// CDP send and failure are joined only by their native requestId within the same pageId.
function canceledCdpCandidates(probe: RawRecord[], fault: RawRecord) {
  const sent = probe.filter((record) => record.value.src === "cdp" && record.value.ev === "Network.requestWillBeSent"
    && typeof record.value.requestId === "string" && isNumber(record.value.pageId)
    && record.value.method === fault.value.method && record.value.path === fault.value.path);
  return sent.flatMap((send) => probe
    .filter((record) => record.value.src === "cdp" && record.value.ev === "Network.loadingFailed" && record.value.requestId === send.value.requestId
      && record.value.pageId === send.value.pageId && record.value.canceled === true && record.value.errorText === fault.value.error)
    .map((failure) => [send, failure]));
}

function sameRequestCdpCanceled(run: RunEvidence, fault: RawRecord, complete: boolean): ConditionResult {
  const ignored = ignoredJoinFields([fault]);
  if (!run.probe) return result("NO_EVIDENCE", [fault.ref], `probe records not given.${ignored}`);
  const candidates = canceledCdpCandidates(run.probe, fault);
  if (candidates.length === 0) {
    return complete
      ? result("NOT_MET", [fault.ref], `complete probe has no canceled CDP failure with this method, path and error.${ignored}`)
      : result("NO_EVIDENCE", [fault.ref], `probe is incomplete and has no canceled CDP candidate.${ignored}`);
  }
  return result("NO_EVIDENCE", candidates.flat().map((record) => record.ref),
    `${candidates.length} canceled CDP candidate(s) share method and path only; the events row has no CDP id, so none is linked.${ignored}`);
}

const pageIdentity = (value: Record<string, unknown>) => isNumber(value.pageId) && isNumber(value.doc) && typeof value.top === "boolean" && isNumber(value.signal);

function cleanupAbortCandidates(probe: RawRecord[], fault: RawRecord) {
  const fetches = probe.filter((record) => record.value.src === "page" && record.value.kind === "fetch" && pageIdentity(record.value)
    && isNumber(record.value.request) && record.value.signalAlreadyAborted === false && record.value.path === fault.value.path);
  return fetches.flatMap((fetch) => probe.filter((record) => {
    const abort = record.value;
    if (abort.src !== "page" || abort.kind !== "abort" || !pageIdentity(abort)) return false;
    if (abort.pageId !== fetch.value.pageId || abort.doc !== fetch.value.doc || abort.top !== fetch.value.top || abort.signal !== fetch.value.signal) return false;
    if (!Array.isArray(abort.requests) || !abort.requests.includes(fetch.value.request)) return false;
    if (abort.stackSkipped !== undefined && abort.stackSkipped !== null && abort.stackSkipped !== false) return false;
    if (abort.stackOmitted !== 0 || !Array.isArray(abort.stack) || !abort.stack.every((line) => typeof line === "string")) return false;
    const stack = abort.stack as string[];
    return stack.some((line) => line.includes("/src/") && !line.includes("node_modules")) && stack.some((line) => EFFECT_CLEANUP_FRAME.test(line));
  }).map((abort) => [fetch, abort]));
}

function appCleanupCausality(run: RunEvidence, fault: RawRecord, complete: boolean): ConditionResult {
  const ignored = run.probe ? ignoredJoinFields([fault, ...run.probe.filter((record) => record.value.src === "page")]) : ignoredJoinFields([fault]);
  if (!run.probe) return result("NO_EVIDENCE", [fault.ref], `probe records not given.${ignored}`);
  const candidates = cleanupAbortCandidates(run.probe, fault);
  if (candidates.length === 0) {
    return complete
      ? result("NOT_MET", [fault.ref], `complete probe has no app effect-cleanup abort of a same-path fetch with full page, document and signal identity.${ignored}`)
      : result("NO_EVIDENCE", [fault.ref], `probe is incomplete and has no cleanup abort candidate.${ignored}`);
  }
  return result("NO_EVIDENCE", candidates.flat().map((record) => record.ref),
    `${candidates.length} app cleanup abort(s) observed for a same-path fetch; page records carry no CDP or events id, so the abort is not linked to this row.${ignored}`);
}

function noServerPriorFailure(run: RunEvidence, fault: RawRecord): ConditionResult {
  if (!run.server) return result("NO_EVIDENCE", [], "server observer records not given");
  if (!run.serverStderr) return result("NO_EVIDENCE", [], "server stderr not given; observer state unknown");
  const disabled = run.serverStderr.filter((line) => line.text.includes(OBSERVER_DISABLED));
  if (disabled.length > 0) return result("NO_EVIDENCE", refs(disabled), "server observer was disabled in at least one process; server records are incomplete");
  const candidates = run.server.filter((record) => record.value.ev === "request-start" && record.value.method === fault.value.method && record.value.path === fault.value.path);
  const ignored = ignoredJoinFields([fault, ...run.server]);
  return result("NO_EVIDENCE", refs(candidates),
    `${candidates.length} server request(s) share method and path only; server ids are not shared with events or CDP, so no server end or abort is tied to this row or to the app abort.${ignored}`);
}

// Capture success only: no observation fault, no page error, and a complete observation after the fault.
function observationCollected(run: RunEvidence, fault: RawRecord): ConditionResult {
  const driver = run.driverResult;
  if (!("observationFault" in driver.value)) return result("NO_EVIDENCE", [driver.ref], "driver-result has no observationFault");
  if (driver.value.observationFault !== null) return result("NOT_MET", [driver.ref], "driver recorded an observation fault");
  const pageErrors = ofType(run, "PAGEERROR");
  if (pageErrors.length > 0) return result("NOT_MET", refs(pageErrors), "the run recorded a page error");
  const later = ofType(run, "OBSERVATION").filter((record) => record.ref.file === fault.ref.file && record.ref.line > fault.ref.line);
  const incomplete = later.filter((record) => !Array.isArray(record.value.missing) || record.value.missing.length > 0);
  if (incomplete.length > 0) return result("NOT_MET", refs(incomplete), "a later observation is missing artifacts");
  if (later.length === 0) return result("NO_EVIDENCE", [driver.ref], "no complete observation after the fault");
  return result("MET", [driver.ref, later[0].ref], "later observation captured; this does not show save or report consistency");
}

// Explicit failures in recorded results: ok false (also on HTTP 200) or a data change without a 2xx status.
// The driver records these as JSON_RESULT only and does not add them to reviewFaults.
function failedResults(run: RunEvidence) {
  return ofType(run, "JSON_RESULT").filter((record) => record.value.ok === false
    || (typeof record.value.method === "string" && MUTATING_METHODS.includes(record.value.method) && (!isNumber(record.value.status) || record.value.status < 200 || record.value.status >= 300)));
}

// Save results recorded by the driver. Report values against the rendered screen have no native record.
function functionalConsistency(run: RunEvidence): ConditionResult {
  const results = ofType(run, "JSON_RESULT");
  const failed = failedResults(run);
  if (failed.length > 0) return result("NOT_MET", refs(failed), "a recorded result failed or a data change did not succeed");
  const saves = results.filter((record) => typeof record.value.method === "string" && MUTATING_METHODS.includes(record.value.method) && isObject(record.value.savedIds));
  return result("NO_EVIDENCE", refs(saves), saves.length > 0
    ? `${saves.length} successful save result(s) recorded; report values against the rendered screen have no native record`
    : "no save result recorded; save and report consistency is not shown");
}

function syntheticOfflineRun(run: RunEvidence): ConditionResult {
  if (!run.receipt) return result("NO_EVIDENCE", [], "run receipt not given");
  const receipt = run.receipt.value;
  const ref = [run.receipt.ref];
  if (typeof receipt.data_label !== "string") return result("NO_EVIDENCE", ref, "receipt has no data_label");
  if (!receipt.data_label.startsWith("SYNTHETIC_")) return result("NOT_MET", ref, `data_label ${receipt.data_label} is not synthetic`);
  if (receipt.source_access !== false) return result("NOT_MET", ref, "receipt does not deny source access");
  const journeys = journeyPhases(run);
  if (journeys.length !== 1) return result(journeys.length > 1 ? "CONFLICT" : "NO_EVIDENCE", ref, `receipt has ${journeys.length} journey phases`);
  const argv = journeys[0].argv;
  if (!Array.isArray(argv)) return result("NO_EVIDENCE", ref, "journey phase has no argv");
  if (!argv.includes("--unshare-net")) return result("NOT_MET", ref, "journey phase was not network isolated");
  return result("MET", ref, "synthetic offline journey receipt");
}

function journeyPhases(run: RunEvidence) {
  const phases = run.receipt?.value.phases;
  return Array.isArray(phases) ? phases.filter((phase): phase is Record<string, unknown> => isObject(phase) && phase.phase === "journey") : [];
}

function classifyCancel(run: RunEvidence, fault: RawRecord, index: number, instrumentation: ConditionResult): FaultRow {
  const complete = instrumentation.status === "MET";
  const conditionResults = {
    exactAbortError: exactAbortError(fault),
    readOnlyGet: readOnlyGet(fault),
    instrumentationComplete: instrumentation,
    sameRequestCdpCanceled: sameRequestCdpCanceled(run, fault, complete),
    appCleanupCausality: appCleanupCausality(run, fault, complete),
    noServerPriorFailure: noServerPriorFailure(run, fault),
    observationCollected: observationCollected(run, fault),
    functionalConsistency: functionalConsistency(run),
  };
  const classification: Classification = conditionResults.readOnlyGet.status === "NOT_MET" ? "FAIL" : allMet(conditionResults) ? "EXPECTED_CANCEL" : "UNRESOLVED";
  return row(index, fault, "RULE1_CANCEL", classification, conditionResults);
}

function classifyCorpcodesAbsence(run: RunEvidence, fault: RawRecord, index: number): FaultRow {
  const candidates = run.events.filter((record) => (record.value.type === "JSON_RESULT" || record.value.type === "RESPONSE")
    && record.value.path === fault.value.path && record.value.status === fault.value.status);
  const ignored = ignoredJoinFields([fault, ...run.events]);
  const noBody = `no linked body: ${candidates.length} JSON_RESULT/RESPONSE record(s) share path and status only and record no body.error or exists`;
  const conditionResults = {
    readOnlyGet: readOnlyGet(fault),
    syntheticOfflineRun: syntheticOfflineRun(run),
    responseBodyLinked: result("NO_EVIDENCE", refs(candidates), `${noBody}; no id links them to this row.${ignored}`),
    bodyErrorIndexMissing: result("NO_EVIDENCE", [], "no linked body"),
    existsFalse: result("NO_EVIDENCE", [], "no linked body"),
    observationCollected: observationCollected(run, fault),
    functionalConsistency: functionalConsistency(run),
  };
  return row(index, fault, "RULE2_DATA_ABSENCE", allMet(conditionResults) ? "EXPECTED_DATA_ABSENCE" : "FAIL", conditionResults);
}

// A console row is only a companion of an excepted 409; it needs the 409 error kind and a direct link to it.
function classifyConsole(run: RunEvidence, fault: RawRecord, index: number): FaultRow {
  const location = fault.value.location;
  const is409 = fault.value.level === "error" && typeof fault.value.message === "string" && CONFLICT_409.test(fault.value.message)
    && isObject(location) && location.path === CORPCODES_STATUS_PATH;
  const errorKind = is409 ? result("MET", [fault.ref], "console error of a corpcodes 409 response")
    : result("NOT_MET", [fault.ref], "console row is not a corpcodes 409 error");
  const linked = result("NO_EVIDENCE", [fault.ref], `console rows carry no response id, so no excepted 409 row is directly linked.${ignoredJoinFields([fault])}`);
  return row(index, fault, is409 ? "RULE2_DATA_ABSENCE" : "NONE", "FAIL", { errorKind409: errorKind, linkedToExpectedResponse: linked });
}

function row(index: number, fault: RawRecord, rule: Rule, classification: Classification, conditionResults: Record<string, ConditionResult>): FaultRow {
  const seen = new Set<string>();
  const evidenceRefs = [fault.ref, ...Object.values(conditionResults).flatMap((condition) => condition.evidenceRefs)].filter((ref) => {
    const key = `${ref.file}:${ref.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const strictImpact: StrictImpact = classification === "EXPECTED_CANCEL" || classification === "EXPECTED_DATA_ABSENCE" ? "EXCEPTED" : "FAIL";
  return { index, ref: fault.ref, rule, classification, strictImpact, conditionResults, evidenceRefs };
}

function classifyHealthWarning(run: RunEvidence, warning: HealthWarningInput, index: number): HealthWarningRow {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(warning.text);
  } catch {
    parsed = null;
  }
  const sourceVerified = warning.sourceKind === "SCREEN_TEXT"
    ? result("NO_EVIDENCE", [warning.ref], "screen text of this run does not identify the warning source or kind; the current contract has no structured health record")
    : result("NOT_MET", [warning.ref], "cited line is not a frame text line of this run");
  const blocking = [
    ...run.events.filter((record) => (record.value.type === "HTTP_ERROR" || (record.value.type === "JSON_RESULT" && record.value.ok === false))
      && typeof record.value.path === "string" && record.value.path.startsWith(ASSUMPTIONS_API_PREFIX)),
    ...ofType(run, "PAGEERROR"),
  ];
  const noBlockingConflict = isObject(parsed)
    ? result("CONFLICT", [warning.ref], "cited line is structured data, not screen text; it cannot stand for a health warning")
    : blocking.length > 0 ? result("CONFLICT", refs(blocking), "the run recorded an HTTP error on the assumptions API or a page error")
      : result("MET", [], "no HTTP error on the assumptions API and no page error recorded");
  const conditionResults = { syntheticOfflineRun: syntheticOfflineRun(run), sourceVerified, noBlockingConflict };
  const fail = conditionResults.syntheticOfflineRun.status === "NOT_MET" || sourceVerified.status === "NOT_MET" || noBlockingConflict.status === "CONFLICT";
  return { index, ref: warning.ref, text: warning.text, sourceKind: warning.sourceKind, classification: fail ? "FAIL" : "UNRESOLVED", countedInRaw: false, conditionResults };
}

// A run whose driver declares a probe must deliver it complete; a producer without a probe has no probe key.
// The probe-writing driver records a plain object, so a present key of any other type (null, array, string) is broken.
function probeComplete(run: RunEvidence, instrumentation: ConditionResult): ConditionResult {
  if (!("probe" in run.driverResult.value)) {
    return run.probe ? result("CONFLICT", [run.driverResult.ref], "probe records given but driver-result declares no probe")
      : result("MET", [run.driverResult.ref], "this producer declares no probe");
  }
  if (!isObject(run.driverResult.value.probe)) {
    return result("NOT_MET", [run.driverResult.ref], `driver-result probe is ${JSON.stringify(run.driverResult.value.probe)}, not a probe record object`);
  }
  if (!run.probe) return result("NO_EVIDENCE", [run.driverResult.ref], "driver-result declares a probe but no probe records were given");
  return instrumentation;
}

// Lifecycle records the fixed driver always writes: observations 0001.. in order starting with "initial",
// commands 1.. in order ending with exactly one stop, and one after-action observation per counted action.
// This detects a cut head and missing observations or commands; other records dropped in between stay undetectable.
function lifecycleRecorded(run: RunEvidence): ConditionResult {
  const observations = ofType(run, "OBSERVATION");
  const commands = ofType(run, "COMMAND");
  if (observations.length === 0) return result("NO_EVIDENCE", [], "no observation recorded; the journey record is not shown");
  const observationGap = observations.findIndex((record, index) => record.value.id !== String(index + 1).padStart(4, "0"));
  if (observationGap >= 0) return result("NOT_MET", [observations[observationGap].ref], `observation ${String(observationGap + 1).padStart(4, "0")} is missing or out of order`);
  if (observations[0].value.reason !== "initial") return result("NOT_MET", [observations[0].ref], "the first observation is not the initial one");
  const commandGap = commands.findIndex((record, index) => record.value.sequence !== index + 1);
  if (commandGap >= 0) return result("NOT_MET", [commands[commandGap].ref], `command ${commandGap + 1} is missing or out of order`);
  const stops = commands.filter((record) => record.value.action === "stop");
  if (stops.length === 0) return result("NO_EVIDENCE", [], "no stop command recorded");
  if (stops.length > 1 || commands[commands.length - 1] !== stops[0]) return result("NOT_MET", refs(stops), "stop is not the single last command");
  const actions = run.driverResult.value.actions;
  if (!isNumber(actions)) return result("NO_EVIDENCE", [run.driverResult.ref], "driver-result has no action count");
  const afterAction = observations.filter((record) => typeof record.value.reason === "string" && record.value.reason.startsWith("after-"));
  if (afterAction.length !== actions) return result("CONFLICT", [run.driverResult.ref], `driver counted ${actions} actions but events hold ${afterAction.length} after-action observations`);
  return result("MET", [observations[0].ref, stops[0].ref, run.driverResult.ref], `${observations.length} observations, ${commands.length} commands, ${actions} actions`);
}

// Run gate for any PASS: the journey finished, collection drained, and the exits agree with the fault count.
function runGate(run: RunEvidence, instrumentation: ConditionResult): RunClassification["runGate"] {
  const driver = run.driverResult;
  const journeys = journeyPhases(run);
  let receiptJourneyComplete: ConditionResult;
  let exitConsistent: ConditionResult;
  const expectedExit = run.faults.length > 0 ? 2 : 0;
  if (!run.receipt) {
    receiptJourneyComplete = result("NO_EVIDENCE", [], "run receipt not given");
    exitConsistent = result("NO_EVIDENCE", [], "run receipt not given");
  } else if (journeys.length !== 1) {
    receiptJourneyComplete = result(journeys.length > 1 ? "CONFLICT" : "NO_EVIDENCE", [run.receipt.ref], `receipt has ${journeys.length} journey phases`);
    exitConsistent = result("NO_EVIDENCE", [run.receipt.ref], "no single journey phase");
  } else {
    const journey = journeys[0];
    const statusFd = isObject(journey.status_fd) ? journey.status_fd : null;
    const ref = [run.receipt.ref];
    if (journey.infrastructure_ok !== true) receiptJourneyComplete = result("NOT_MET", ref, "journey infrastructure_ok is not true");
    else if (journey.timed_out !== false) receiptJourneyComplete = result("NOT_MET", ref, "journey timed out or timeout state missing");
    else if (journey.outer_reaped !== true || journey.init_exited !== true) receiptJourneyComplete = result("NOT_MET", ref, "journey process was not reaped");
    else if (!statusFd || statusFd.malformed !== false || !isNumber(statusFd.exit_code)) receiptJourneyComplete = result("NOT_MET", ref, "journey status report missing or malformed");
    else if (!isNumber(journey.outer_exit) || journey.outer_exit !== statusFd.exit_code) receiptJourneyComplete = result("CONFLICT", ref, "outer exit and status exit differ");
    else receiptJourneyComplete = result("MET", ref, "journey phase completed and reaped");
    exitConsistent = isNumber(journey.outer_exit) && journey.outer_exit === expectedExit
      ? result("MET", ref, `journey exit ${expectedExit} matches ${run.faults.length} review faults`)
      : result("NOT_MET", ref, `journey exit ${String(journey.outer_exit)} does not match the expected ${expectedExit} for ${run.faults.length} review faults`);
  }
  const expectedStatus = run.faults.length > 0 ? "OBSERVED_WITH_UNRESOLVED_FAULTS" : "STAGE_OBSERVED_COMPLETE";
  const driverRef = [driver.ref];
  const driverComplete = driver.value.status !== expectedStatus ? result("NOT_MET", driverRef, `driver status ${String(driver.value.status)} is not ${expectedStatus}`)
    : driver.value.humanReportedComplete !== true ? result("NOT_MET", driverRef, "journey was not reported complete")
      : driver.value.browserClosed !== true ? result("NOT_MET", driverRef, "browser was not closed")
        : driver.value.observationFault !== null ? result("NOT_MET", driverRef, "driver recorded an observation fault")
          : result("MET", driverRef, `driver ${expectedStatus}`);
  const errorEvents = run.events.filter((record) => typeof record.value.type === "string" && DRIVER_ERROR_EVENTS.includes(record.value.type));
  const shutdowns = ofType(run, "OWNED_SERVER_SHUTDOWN");
  const last = run.events[run.events.length - 1];
  const failed = failedResults(run);
  const conditionResults = {
    receiptJourneyComplete,
    driverComplete,
    exitConsistent,
    lifecycleRecorded: lifecycleRecorded(run),
    probeComplete: probeComplete(run, instrumentation),
    noRecordedResultFailure: failed.length > 0 ? result("NOT_MET", refs(failed), "a recorded result failed or a data change did not succeed")
      : result("MET", [], "no failed JSON_RESULT recorded; this does not prove functional consistency"),
    noFatalFault: run.fatalFaults.length > 0 ? result("NOT_MET", refs(run.fatalFaults), "the run recorded FATAL fault rows") : result("MET", [], "no FATAL fault row"),
    noDriverErrorEvents: errorEvents.length > 0 ? result("NOT_MET", refs(errorEvents), "the driver recorded error or capture-limit events") : result("MET", [], "no driver error event"),
    eventsDrained: shutdowns.length === 0 ? result("NO_EVIDENCE", [], "no OWNED_SERVER_SHUTDOWN; events may be truncated")
      : last.value.type !== "OWNED_SERVER_SHUTDOWN" ? result("NOT_MET", [last.ref], "events continue after the owned server shutdown")
        : result("MET", [last.ref], "events end with the owned server shutdown; this marks the end only, not completeness"),
  };
  return { status: allMet(conditionResults) ? "MET" : "NOT_MET", conditionResults };
}

export function classifyRun(run: RunEvidence): RunClassification {
  const instrumentation = instrumentationComplete(run);
  const rows = run.faults.map((fault, index) => {
    const type = fault.value.type;
    if (type === "REQUEST_FAILED") return classifyCancel(run, fault, index, instrumentation);
    if (type === "HTTP_ERROR" && fault.value.path === CORPCODES_STATUS_PATH && fault.value.status === 409) return classifyCorpcodesAbsence(run, fault, index);
    if (type === "CONSOLE") return classifyConsole(run, fault, index);
    const outside = type === "HTTP_ERROR" ? `HTTP ${String(fault.value.status)} on ${String(fault.value.path)} is outside rule 2` : `fault type ${String(type)} has no approved exception rule`;
    return row(index, fault, "NONE", "FAIL", { approvedRule: result("NOT_MET", [fault.ref], outside) });
  });
  const healthWarnings = run.healthWarnings.map((warning, index) => classifyHealthWarning(run, warning, index));
  const gate = runGate(run, instrumentation);
  const counts: Record<Classification, number> = { EXPECTED_CANCEL: 0, EXPECTED_DATA_ABSENCE: 0, UNRESOLVED: 0, FAIL: 0 };
  for (const current of rows) counts[current.classification] += 1;
  const failingRows = rows.filter((current) => current.strictImpact === "FAIL").map((current) => current.index);
  const failingHealthWarnings = healthWarnings.map((warning) => warning.index);
  const failingRunGate = Object.entries(gate.conditionResults).filter(([, condition]) => condition.status !== "MET").map(([name]) => name);
  // Zero rows can pass only through the run gate: a completed, drained run whose exits agree with no faults.
  const pass = failingRows.length === 0 && failingHealthWarnings.length === 0 && failingRunGate.length === 0;
  return { runId: run.runId, rawCount: rows.length, rows, healthWarnings, runGate: gate, counts, strict: { result: pass ? "PASS" : "FAIL", failingRows, failingHealthWarnings, failingRunGate } };
}
