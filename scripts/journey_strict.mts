// journey:strict - validates one recorded journey run against the #304 fault policy without running anything.
// It reads explicit evidence files, keeps every raw fault row verbatim, and prints one JSON report.
// Exit 0: strict PASS. Exit 1: strict FAIL. Exit 2: input or contract error (stderr JSON, empty stdout).
// The original driver and outer exit are copied from the receipt and never replaced by the strict exit.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { classifyRun, type EvidenceRef, type HealthWarningInput, type RawRecord, type TextLine } from "./lib/journeyFaultPolicy.mts";

const SCHEMA = "journey-strict/v2";
const EVENT_ONLY_KEYS = ["at", "stage", "faultClass"];
const DRIVER_ONLY_KEYS = ["duringShutdown"];
const SINGLE_FLAGS = ["--run-id", "--events", "--driver-result", "--receipt", "--probe", "--server-stderr", "--output"];
const MULTI_FLAGS = ["--server-observer", "--health-warning"];
const REQUIRED_FLAGS = ["--run-id", "--events", "--driver-result"];
const USAGE = "journey:strict --run-id ID --events FILE --driver-result FILE [--receipt FILE] [--probe FILE] [--server-observer FILE]... [--server-stderr FILE] [--health-warning FILE:LINE]... [--output NEW_FILE]";
// Fixed names the current driver writes (events.jsonl, server.stderr, probe.jsonl, server-observer/<pid>.jsonl,
// driver-result.json) and the launcher receipt result.json.
const EVENTS_FILE = "events.jsonl";
const DRIVER_RESULT_FILE = "driver-result.json";
const RECEIPT_FILE = "result.json";
const PROBE_FILE = "probe.jsonl";
const SERVER_OBSERVER_DIR = "server-observer";
const SERVER_STDERR_FILE = "server.stderr";
// --run-id is a report label. Run identity is checked only through the layout below, which the driver writes.
const RUN_IDENTITY = "layout only: fixed driver file names in one run directory, probe and server observer at the fixed paths driver-result.probe declares, every input inside the run tree after resolving symlinks, the receipt at <root>/result.json with events in <root>/private/run. File location does not prove that the content came from the same run.";

class InputError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

type Args = { single: Map<string, string>; multi: Map<string, string[]> };
type InputFile = { role: string; path: string; text: string; sha256: string; bytes: number; lines: number };
type LineRecord = RawRecord & { rawLine: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

function parseArgs(argv: string[]): Args {
  const single = new Map<string, string>();
  const multi = new Map<string, string[]>(MULTI_FLAGS.map((flag) => [flag, []]));
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!SINGLE_FLAGS.includes(flag) && !MULTI_FLAGS.includes(flag)) throw new InputError("ARG_UNKNOWN", `unknown argument ${flag}; usage: ${USAGE}`);
    if (value === undefined || value === "" || value.startsWith("--")) throw new InputError("ARG_VALUE", `${flag} needs a value`);
    if (MULTI_FLAGS.includes(flag)) multi.get(flag)!.push(value);
    else if (single.has(flag)) throw new InputError("ARG_DUPLICATE", `${flag} given twice`);
    else single.set(flag, value);
  }
  const missing = REQUIRED_FLAGS.filter((flag) => !single.has(flag));
  if (missing.length > 0) throw new InputError("ARG_MISSING", `missing ${missing.join(", ")}; usage: ${USAGE}`);
  return { single, multi };
}

function readInput(role: string, file: string): InputFile {
  let resolved: string;
  let buffer: Buffer;
  try {
    resolved = fs.realpathSync(path.resolve(file));
    buffer = fs.readFileSync(resolved);
  } catch (error) {
    throw new InputError("INPUT_READ", `${role}: cannot read ${file}: ${(error as Error).message}`);
  }
  const text = buffer.toString("utf8");
  const parts = text.split("\n");
  return { role, path: resolved, text, sha256: sha256(buffer), bytes: buffer.length, lines: text.endsWith("\n") ? parts.length - 1 : parts.length };
}

function textLines(input: InputFile): string[] {
  const parts = input.text.split("\n");
  if (parts[parts.length - 1] === "") parts.pop();
  return parts;
}

function parseJsonLines(input: InputFile, code: string): LineRecord[] {
  return textLines(input).map((rawLine, index) => {
    const line = index + 1;
    if (rawLine.trim() === "") throw new InputError(code, `${input.path}:${line} is an empty line`);
    let value: unknown;
    try {
      value = JSON.parse(rawLine);
    } catch (error) {
      throw new InputError(code, `${input.path}:${line} is not JSON: ${(error as Error).message}`);
    }
    if (!isObject(value)) throw new InputError(code, `${input.path}:${line} is not a JSON object`);
    return { ref: { file: input.path, line }, value, rawLine };
  });
}

function parseJsonObject(input: InputFile, code: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(input.text);
  } catch (error) {
    throw new InputError(code, `${input.path} is not JSON: ${(error as Error).message}`);
  }
  if (!isObject(value)) throw new InputError(code, `${input.path} is not a JSON object`);
  return value;
}

function isInside(directory: string, file: string) {
  const relative = path.relative(directory, file);
  return relative !== "" && !path.isAbsolute(relative) && relative.split(path.sep)[0] !== "..";
}

function requireLayout(ok: boolean, message: string) {
  if (!ok) throw new InputError("RUN_TREE_MISMATCH", message);
}

function compareFaultLists(faults: LineRecord[], driverFaults: unknown[]) {
  if (faults.length !== driverFaults.length) {
    throw new InputError("FAULT_LIST_MISMATCH", `events has ${faults.length} REVIEW fault rows but driver-result reviewFaults has ${driverFaults.length}`);
  }
  faults.forEach((fault, index) => {
    const driverFault = driverFaults[index];
    if (!isObject(driverFault)) throw new InputError("DRIVER_CONTRACT", `driver-result reviewFaults[${index}] is not an object`);
    for (const key of Object.keys(driverFault)) {
      if (!DRIVER_ONLY_KEYS.includes(key) && !isDeepStrictEqual(driverFault[key], fault.value[key])) {
        throw new InputError("FAULT_LIST_MISMATCH", `fault ${index} (${fault.ref.file}:${fault.ref.line}) differs from reviewFaults[${index}] in ${key}`);
      }
    }
    for (const key of Object.keys(fault.value)) {
      if (!EVENT_ONLY_KEYS.includes(key) && !(key in driverFault)) {
        throw new InputError("FAULT_LIST_MISMATCH", `fault ${index} (${fault.ref.file}:${fault.ref.line}) has ${key}, reviewFaults[${index}] does not`);
      }
    }
  });
}

function duplicateGroups(driverFaults: unknown[]) {
  const grouped = new Set<number>();
  const groups: number[][] = [];
  driverFaults.forEach((fault, index) => {
    if (grouped.has(index)) return;
    const group = [index];
    for (let other = index + 1; other < driverFaults.length; other += 1) {
      if (!grouped.has(other) && isDeepStrictEqual(fault, driverFaults[other])) group.push(other);
    }
    if (group.length > 1) {
      for (const member of group) grouped.add(member);
      groups.push(group);
    }
  });
  return groups;
}

function journeyPhaseLine(input: InputFile) {
  const line = textLines(input).findIndex((text) => /"phase"\s*:\s*"journey"/.test(text));
  return line >= 0 ? line + 1 : 1;
}

const rawEntry = (record: LineRecord) => ({ file: record.ref.file, line: record.ref.line, rawLine: record.rawLine, rawLineSha256: sha256(record.rawLine), parsed: record.value });

function buildReport(args: Args) {
  const flag = (name: string) => args.single.get(name) ?? null;
  const inputs: InputFile[] = [];
  const read = (role: string, file: string) => {
    const input = readInput(role, file);
    inputs.push(input);
    return input;
  };

  const eventsInput = read("events", flag("--events")!);
  const driverInput = read("driver-result", flag("--driver-result")!);
  const receiptInput = flag("--receipt") ? read("receipt", flag("--receipt")!) : null;
  const probeInput = flag("--probe") ? read("probe", flag("--probe")!) : null;
  const serverInputs = args.multi.get("--server-observer")!.map((file) => read("server-observer", file));
  const stderrInput = flag("--server-stderr") ? read("server-stderr", flag("--server-stderr")!) : null;
  const warningSpecs = args.multi.get("--health-warning")!.map((spec) => {
    const separator = spec.lastIndexOf(":");
    const line = Number(spec.slice(separator + 1));
    if (separator <= 0 || !Number.isInteger(line) || line < 1) throw new InputError("ARG_VALUE", `--health-warning needs FILE:LINE, got ${spec}`);
    return { file: spec.slice(0, separator), line };
  });
  const warningInputs = new Map<string, InputFile>();
  const warnings = warningSpecs.map(({ file, line }) => {
    const resolved = path.resolve(file);
    const input = warningInputs.get(resolved) ?? read("health-warning", file);
    warningInputs.set(resolved, input);
    return { input, line };
  });

  const events = parseJsonLines(eventsInput, "EVENTS_PARSE");
  if (events.length === 0) throw new InputError("EVENTS_EMPTY", `${eventsInput.path} has no records; an empty file is not a run`);
  const driver = parseJsonObject(driverInput, "DRIVER_PARSE");
  if (typeof driver.stage !== "string") throw new InputError("DRIVER_CONTRACT", "driver-result has no stage");
  if (!Array.isArray(driver.reviewFaults)) throw new InputError("DRIVER_CONTRACT", "driver-result has no reviewFaults list");
  const driverFaults = driver.reviewFaults as unknown[];

  const faults: LineRecord[] = [];
  const fatalFaults: LineRecord[] = [];
  for (const record of events) {
    if (!("faultClass" in record.value)) continue;
    const where = `${record.ref.file}:${record.ref.line}`;
    if (record.value.faultClass !== "REVIEW" && record.value.faultClass !== "FATAL") throw new InputError("FAULT_CLASS_UNKNOWN", `${where} has faultClass ${JSON.stringify(record.value.faultClass)}`);
    if (typeof record.value.type !== "string" || record.value.type === "") throw new InputError("FAULT_TYPE_MISSING", `${where} has no fault type`);
    (record.value.faultClass === "REVIEW" ? faults : fatalFaults).push(record);
  }
  compareFaultLists(faults, driverFaults);
  for (const record of events) {
    if (("faultClass" in record.value || "stage" in record.value) && record.value.stage !== driver.stage) {
      throw new InputError("STAGE_MISMATCH", `${record.ref.file}:${record.ref.line} stage ${JSON.stringify(record.value.stage)} is not driver-result stage ${driver.stage}`);
    }
  }

  // Paths are realpaths (symlinks resolved), so a link out of the run tree is caught by the containment check.
  const runDir = path.dirname(eventsInput.path);
  const root = receiptInput ? path.dirname(receiptInput.path) : runDir;
  requireLayout(path.basename(eventsInput.path) === EVENTS_FILE, `events file must be named ${EVENTS_FILE}`);
  requireLayout(driverInput.path === path.join(runDir, DRIVER_RESULT_FILE), `driver-result must be ${DRIVER_RESULT_FILE} in the events directory ${runDir}`);
  if (receiptInput) {
    requireLayout(path.basename(receiptInput.path) === RECEIPT_FILE, `receipt must be named ${RECEIPT_FILE}`);
    requireLayout(runDir === path.join(root, "private", "run"), `events ${eventsInput.path} is not in ${root}/private/run of the receipt`);
  }
  for (const input of inputs) {
    requireLayout(input === receiptInput || isInside(root, input.path), `${input.role} ${input.path} is outside the run tree ${root}`);
  }
  const declared = isObject(driver.probe) ? driver.probe : null;
  if (probeInput) {
    requireLayout(declared !== null && declared.file === PROBE_FILE && probeInput.path === path.join(runDir, PROBE_FILE),
      `probe ${probeInput.path} is not ${PROBE_FILE} in the events directory, or driver-result does not declare it`);
  }
  for (const input of serverInputs) {
    requireLayout(declared !== null && declared.serverObserverDir === SERVER_OBSERVER_DIR && path.dirname(input.path) === path.join(runDir, SERVER_OBSERVER_DIR)
      && /^\d+\.jsonl$/.test(path.basename(input.path)), `server observer ${input.path} is not a <pid>.jsonl file in ${SERVER_OBSERVER_DIR} declared by driver-result`);
  }
  if (stderrInput) requireLayout(stderrInput.path === path.join(runDir, SERVER_STDERR_FILE), `server stderr must be ${SERVER_STDERR_FILE} in the events directory`);

  let receipt: RawRecord | null = null;
  let originalExit: Record<string, unknown> | "NOT_PROVIDED" = "NOT_PROVIDED";
  if (receiptInput) {
    const value = parseJsonObject(receiptInput, "RECEIPT_PARSE");
    const journeys = Array.isArray(value.phases) ? value.phases.filter((phase) => isObject(phase) && phase.phase === "journey") : [];
    if (journeys.length !== 1) throw new InputError("RECEIPT_CONTRACT", `receipt has ${journeys.length} journey phases, expected exactly 1`);
    const journey = journeys[0] as Record<string, unknown>;
    const ref: EvidenceRef = { file: receiptInput.path, line: journeyPhaseLine(receiptInput) };
    receipt = { ref, value };
    originalExit = {
      journeyOuterExit: journey.outer_exit ?? null,
      statusFdExit: isObject(journey.status_fd) ? journey.status_fd.exit_code ?? null : null,
      ref,
    };
  }

  const probe = probeInput ? parseJsonLines(probeInput, "PROBE_PARSE") : null;
  const server = serverInputs.length > 0 ? serverInputs.flatMap((input) => parseJsonLines(input, "SERVER_OBSERVER_PARSE")) : null;
  const serverStderr: TextLine[] | null = stderrInput ? textLines(stderrInput).map((text, index) => ({ ref: { file: stderrInput.path, line: index + 1 }, text })) : null;
  const framesDir = path.join(runDir, "frames");
  const healthWarnings = warnings.map(({ input, line }): HealthWarningInput => {
    const text = textLines(input)[line - 1];
    if (text === undefined || text.trim() === "") throw new InputError("HEALTH_WARNING_LINE", `${input.path}:${line} has no warning line`);
    const screenText = path.dirname(input.path) === framesDir && input.path.endsWith(".text.txt");
    return { ref: { file: input.path, line }, text, sourceKind: screenText ? "SCREEN_TEXT" : "OTHER" };
  });

  const classified = classifyRun({
    runId: flag("--run-id")!,
    faults,
    fatalFaults,
    events,
    driverResult: { ref: { file: driverInput.path, line: 1 }, value: driver },
    receipt,
    probe,
    server,
    serverStderr,
    healthWarnings,
  });

  return {
    schema: SCHEMA,
    runId: classified.runId,
    runIdentity: RUN_IDENTITY,
    stage: driver.stage,
    inputs: inputs.map(({ role, path: file, sha256: hash, bytes, lines }) => ({ role, path: file, sha256: hash, bytes, lines })),
    originalExit,
    driverStatus: driver.status ?? null,
    rawCount: classified.rawCount,
    faultListComparison: { eventsFaultCount: faults.length, driverFaultCount: driverFaults.length, match: true, ignoredEventKeys: EVENT_ONLY_KEYS, ignoredDriverKeys: DRIVER_ONLY_KEYS },
    duplicateGroups: duplicateGroups(driverFaults),
    rawFaults: classified.rows.map((row) => ({
      index: row.index,
      ...rawEntry(faults[row.index]),
      driverFault: driverFaults[row.index],
      rule: row.rule,
      classification: row.classification,
      strictImpact: row.strictImpact,
      conditionResults: row.conditionResults,
      evidenceRefs: row.evidenceRefs,
    })),
    fatalFaults: fatalFaults.map(rawEntry),
    healthWarnings: classified.healthWarnings,
    runGate: classified.runGate,
    counts: classified.counts,
    strict: { ...classified.strict, exitCode: classified.strict.result === "PASS" ? 0 : 1 },
  };
}

export function runCli(argv: string[]): { exitCode: number; stdout: string; stderr: string } {
  const failure = (code: string, message: string) => ({ exitCode: 2, stdout: "", stderr: JSON.stringify({ schema: SCHEMA, error: { code, message } }) + "\n" });
  try {
    const args = parseArgs(argv);
    const report = buildReport(args);
    const stdout = JSON.stringify(report, null, 2) + "\n";
    const output = args.single.get("--output");
    if (output !== undefined) {
      try {
        fs.writeFileSync(path.resolve(output), stdout, { flag: "wx" });
      } catch (error) {
        const exists = (error as NodeJS.ErrnoException).code === "EEXIST";
        return failure(exists ? "OUTPUT_EXISTS" : "OUTPUT_WRITE", `${output}: ${(error as Error).message}`);
      }
    }
    return { exitCode: report.strict.exitCode, stdout, stderr: "" };
  } catch (error) {
    if (error instanceof InputError) return failure(error.code, error.message);
    return failure("INTERNAL_ERROR", (error as Error).stack ?? String(error));
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  const outcome = runCli(process.argv.slice(2));
  process.stdout.write(outcome.stdout);
  process.stderr.write(outcome.stderr);
  process.exitCode = outcome.exitCode;
}
