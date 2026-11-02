import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const PLANNING_WRITER_LEASE_VERSION = 1;

export const PLANNING_WRITER_LEASE_ERROR_CODES = Object.freeze({
  INPUT_INVALID: "PLANNING_WRITER_LEASE_INPUT_INVALID",
  HELD: "PLANNING_WRITER_LEASE_HELD",
  FOREIGN_HOST: "PLANNING_WRITER_LEASE_FOREIGN_HOST",
  OWNER_UNKNOWN: "PLANNING_WRITER_LEASE_OWNER_UNKNOWN",
  MALFORMED: "PLANNING_WRITER_LEASE_MALFORMED",
  STATE_UNKNOWN: "PLANNING_WRITER_LEASE_STATE_UNKNOWN",
  STATE_CHANGED: "PLANNING_WRITER_LEASE_STATE_CHANGED",
  RECOVERY_BUSY: "PLANNING_WRITER_LEASE_RECOVERY_BUSY",
  UPDATE_BUSY: "PLANNING_WRITER_LEASE_UPDATE_BUSY",
  NOT_FOUND: "PLANNING_WRITER_LEASE_NOT_FOUND",
  CAPABILITY_INVALID: "PLANNING_WRITER_LEASE_CAPABILITY_INVALID",
  RELEASE_NOT_OWNER: "PLANNING_WRITER_LEASE_RELEASE_NOT_OWNER",
  CHILD_NOT_ALIVE: "PLANNING_WRITER_LEASE_CHILD_NOT_ALIVE",
  CHILD_STATUS_UNKNOWN: "PLANNING_WRITER_LEASE_CHILD_STATUS_UNKNOWN",
});

const LEASE_FILE_NAME = "writer-lease.json";
const RECOVERY_MUTEX_FILE_NAME = "writer-lease.recovery";
const UPDATE_MUTEX_FILE_NAME = "writer-lease.update";
const MAX_LEASE_FILE_BYTES = 16 * 1024;
const CAPABILITY_PREFIX = "plw1.";
const LEASE_PAYLOAD_KEYS = Object.freeze([
  "childPids",
  "createdAt",
  "dataRoot",
  "hostname",
  "leaseId",
  "ownerTokenHash",
  "pid",
  "version",
  "writerId",
]);
const MUTEX_PAYLOAD_KEYS = Object.freeze([
  "createdAt",
  "hostname",
  "kind",
  "mutexId",
  "pid",
  "version",
]);

export class PlanningWriterLeaseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PlanningWriterLeaseError";
    this.code = code;
  }
}

function leaseError(code, message) {
  return new PlanningWriterLeaseError(code, message);
}

function hasErrorCode(error, code) {
  return Boolean(error && typeof error === "object" && error.code === code);
}

function assertNonEmptyString(value, fieldName, maximumLength = 4096) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maximumLength) {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.INPUT_INVALID,
      `${fieldName} must be a non-empty string.`,
    );
  }
  return value;
}

function assertPid(value, fieldName) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.INPUT_INVALID,
      `${fieldName} must be a positive integer.`,
    );
  }
  return value;
}

function ownerTokenHash(ownerToken) {
  return createHash("sha256").update(ownerToken, "utf8").digest("hex");
}

function createCapability(leaseId, ownerToken) {
  return `${CAPABILITY_PREFIX}${leaseId}.${ownerToken}`;
}

function parseCapability(capability) {
  if (typeof capability !== "string" || !capability.startsWith(CAPABILITY_PREFIX)) {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.CAPABILITY_INVALID,
      "Planning writer lease capability is invalid.",
    );
  }

  const separator = capability.indexOf(".", CAPABILITY_PREFIX.length);
  const leaseId = capability.slice(CAPABILITY_PREFIX.length, separator);
  const ownerToken = separator >= 0 ? capability.slice(separator + 1) : "";
  if (leaseId.length === 0 || ownerToken.length === 0) {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.CAPABILITY_INVALID,
      "Planning writer lease capability is invalid.",
    );
  }

  return { leaseId, ownerToken };
}

function tokenHashMatches(expectedHash, ownerToken) {
  const actual = Buffer.from(ownerTokenHash(ownerToken), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function frozenMetadata(payload) {
  return Object.freeze({
    ...payload,
    childPids: Object.freeze([...payload.childPids]),
  });
}

function serializedPayload(payload) {
  return `${JSON.stringify(payload)}\n`;
}

function isCanonicalIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString() === value;
}

function isValidStoredPid(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function parseLeasePayload(source, expectedDataRoot) {
  let payload;
  try {
    payload = JSON.parse(source);
  } catch {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.MALFORMED,
      "Planning writer lease payload is malformed.",
    );
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.MALFORMED,
      "Planning writer lease payload is malformed.",
    );
  }

  const keys = Object.keys(payload).sort();
  if (keys.length !== LEASE_PAYLOAD_KEYS.length
    || keys.some((key, index) => key !== LEASE_PAYLOAD_KEYS[index])) {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.MALFORMED,
      "Planning writer lease payload has an unsupported shape.",
    );
  }

  const childPidsAreValid = Array.isArray(payload.childPids)
    && payload.childPids.every(isValidStoredPid)
    && new Set(payload.childPids).size === payload.childPids.length;
  const isValid = payload.version === PLANNING_WRITER_LEASE_VERSION
    && typeof payload.writerId === "string"
    && payload.writerId.length > 0
    && payload.writerId.length <= 256
    && isValidStoredPid(payload.pid)
    && typeof payload.hostname === "string"
    && payload.hostname.length > 0
    && payload.hostname.length <= 256
    && typeof payload.leaseId === "string"
    && payload.leaseId.length > 0
    && payload.leaseId.length <= 128
    && typeof payload.ownerTokenHash === "string"
    && /^[a-f0-9]{64}$/.test(payload.ownerTokenHash)
    && isCanonicalIsoTimestamp(payload.createdAt)
    && payload.dataRoot === expectedDataRoot
    && childPidsAreValid;

  if (!isValid) {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.MALFORMED,
      "Planning writer lease payload is malformed.",
    );
  }

  return frozenMetadata(payload);
}

function parseMutexPayload(source, expectedKind) {
  let payload;
  try {
    payload = JSON.parse(source);
  } catch {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.MALFORMED,
      `Planning writer lease ${expectedKind} mutex is malformed.`,
    );
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.MALFORMED,
      `Planning writer lease ${expectedKind} mutex is malformed.`,
    );
  }
  const keys = Object.keys(payload).sort();
  const valid = keys.length === MUTEX_PAYLOAD_KEYS.length
    && keys.every((key, index) => key === MUTEX_PAYLOAD_KEYS[index])
    && payload.version === 1
    && payload.kind === expectedKind
    && isValidStoredPid(payload.pid)
    && typeof payload.hostname === "string"
    && payload.hostname.length > 0
    && payload.hostname.length <= 256
    && typeof payload.mutexId === "string"
    && payload.mutexId.length > 0
    && payload.mutexId.length <= 128
    && isCanonicalIsoTimestamp(payload.createdAt);
  if (!valid) {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.MALFORMED,
      `Planning writer lease ${expectedKind} mutex is malformed.`,
    );
  }
  return Object.freeze(payload);
}

async function readMutexPayload(filePath, expectedKind) {
  let fileHandle;
  try {
    const entry = await lstat(filePath);
    if (!entry.isFile() || entry.isSymbolicLink() || entry.size > MAX_LEASE_FILE_BYTES) {
      throw leaseError(
        PLANNING_WRITER_LEASE_ERROR_CODES.MALFORMED,
        `Planning writer lease ${expectedKind} mutex is not a supported regular file.`,
      );
    }
    fileHandle = await open(filePath, "r");
    const fileStat = await fileHandle.stat();
    if (!fileStat.isFile()
      || fileStat.size > MAX_LEASE_FILE_BYTES
      || fileStat.dev !== entry.dev
      || fileStat.ino !== entry.ino) {
      throw leaseError(
        PLANNING_WRITER_LEASE_ERROR_CODES.STATE_CHANGED,
        `Planning writer lease ${expectedKind} mutex changed while being read.`,
      );
    }
    const source = await fileHandle.readFile("utf8");
    return Object.freeze({
      payload: parseMutexPayload(source, expectedKind),
      dev: fileStat.dev,
      ino: fileStat.ino,
    });
  } catch (error) {
    if (error instanceof PlanningWriterLeaseError || hasErrorCode(error, "ENOENT")) {
      throw error;
    }
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.STATE_UNKNOWN,
      `Planning writer lease ${expectedKind} mutex could not be read.`,
    );
  } finally {
    await fileHandle?.close().catch(() => undefined);
  }
}

function sameMutexPayload(left, right) {
  return left.version === right.version
    && left.kind === right.kind
    && left.pid === right.pid
    && left.hostname === right.hostname
    && left.mutexId === right.mutexId
    && left.createdAt === right.createdAt;
}

async function canonicalLeaseContext(dataRoot) {
  const suppliedRoot = assertNonEmptyString(dataRoot, "dataRoot");
  try {
    await mkdir(suppliedRoot, { recursive: true, mode: 0o700 });
    const canonicalDataRoot = await realpath(suppliedRoot);
    const runtimePath = path.join(canonicalDataRoot, "runtime");
    await mkdir(runtimePath, { recursive: true, mode: 0o700 });

    const runtimeEntry = await lstat(runtimePath);
    const canonicalRuntimePath = await realpath(runtimePath);
    if (!runtimeEntry.isDirectory()
      || runtimeEntry.isSymbolicLink()
      || canonicalRuntimePath !== runtimePath) {
      throw leaseError(
        PLANNING_WRITER_LEASE_ERROR_CODES.STATE_UNKNOWN,
        "Planning writer lease runtime directory is not a canonical directory.",
      );
    }

    return Object.freeze({
      dataRoot: canonicalDataRoot,
      runtimePath,
      lockPath: path.join(runtimePath, LEASE_FILE_NAME),
      recoveryMutexPath: path.join(runtimePath, RECOVERY_MUTEX_FILE_NAME),
      updateMutexPath: path.join(runtimePath, UPDATE_MUTEX_FILE_NAME),
    });
  } catch (error) {
    if (error instanceof PlanningWriterLeaseError) throw error;
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.STATE_UNKNOWN,
      "Planning writer lease data root could not be prepared.",
    );
  }
}

async function readLeasePayload(lockPath, expectedDataRoot) {
  let fileHandle;
  try {
    const entry = await lstat(lockPath);
    if (!entry.isFile() || entry.isSymbolicLink() || entry.size > MAX_LEASE_FILE_BYTES) {
      throw leaseError(
        PLANNING_WRITER_LEASE_ERROR_CODES.MALFORMED,
        "Planning writer lease file is not a supported regular file.",
      );
    }

    fileHandle = await open(lockPath, "r");
    const fileStat = await fileHandle.stat();
    if (!fileStat.isFile() || fileStat.size > MAX_LEASE_FILE_BYTES) {
      throw leaseError(
        PLANNING_WRITER_LEASE_ERROR_CODES.MALFORMED,
        "Planning writer lease file is not a supported regular file.",
      );
    }
    const source = await fileHandle.readFile("utf8");
    return parseLeasePayload(source, expectedDataRoot);
  } catch (error) {
    if (error instanceof PlanningWriterLeaseError || hasErrorCode(error, "ENOENT")) {
      throw error;
    }
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.STATE_UNKNOWN,
      "Planning writer lease state could not be read.",
    );
  } finally {
    await fileHandle?.close().catch(() => undefined);
  }
}

async function createExclusiveFile(filePath, contents, busyCode, busyMessage) {
  let fileHandle;
  try {
    fileHandle = await open(filePath, "wx", 0o600);
    await fileHandle.writeFile(contents, "utf8");
    await fileHandle.sync();
    return fileHandle;
  } catch (error) {
    await fileHandle?.close().catch(() => undefined);
    if (hasErrorCode(error, "EEXIST")) {
      throw leaseError(busyCode, busyMessage);
    }
    throw error;
  }
}

async function createLeaseFile(lockPath, payload) {
  let fileHandle;
  try {
    fileHandle = await open(lockPath, "wx", 0o600);
    await fileHandle.writeFile(serializedPayload(payload), "utf8");
    await fileHandle.sync();
  } catch (error) {
    await fileHandle?.close().catch(() => undefined);
    if (hasErrorCode(error, "EEXIST")) throw error;
    if (fileHandle) await unlink(lockPath).catch(() => undefined);
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.STATE_UNKNOWN,
      "Planning writer lease could not be created.",
    );
  } finally {
    await fileHandle?.close().catch(() => undefined);
  }
}

async function recoverStaleMutex(filePath, observed, busyCode, kind) {
  if (observed.payload.hostname !== os.hostname()) {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.FOREIGN_HOST,
      `Planning writer lease ${kind} mutex belongs to a different host.`,
    );
  }
  const status = inspectPid(observed.payload.pid);
  if (status === "alive") {
    throw leaseError(busyCode, `Planning writer lease ${kind} is already in progress.`);
  }
  if (status === "unknown") {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.OWNER_UNKNOWN,
      `Planning writer lease ${kind} mutex owner state is unknown.`,
    );
  }

  const current = await readMutexPayload(filePath, kind);
  if (current.dev !== observed.dev
    || current.ino !== observed.ino
    || !sameMutexPayload(current.payload, observed.payload)) {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.STATE_CHANGED,
      `Planning writer lease ${kind} mutex changed during stale recovery.`,
    );
  }
  await unlink(filePath);
}

async function acquireMutex(filePath, busyCode, kind) {
  const marker = serializedPayload({
    version: 1,
    kind,
    pid: process.pid,
    hostname: os.hostname(),
    mutexId: randomUUID(),
    createdAt: new Date().toISOString(),
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const fileHandle = await createExclusiveFile(
        filePath,
        marker,
        busyCode,
        `Planning writer lease ${kind} is already in progress.`,
      );
      const fileStat = await fileHandle.stat();
      return { fileHandle, fileStat, filePath };
    } catch (error) {
      if (!hasErrorCode(error, busyCode)) throw error;
    }

    let observed;
    try {
      observed = await readMutexPayload(filePath, kind);
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) continue;
      throw error;
    }
    await recoverStaleMutex(filePath, observed, busyCode, kind);
  }
  throw leaseError(
    PLANNING_WRITER_LEASE_ERROR_CODES.STATE_UNKNOWN,
    `Planning writer lease ${kind} mutex could not be acquired after concurrent state changes.`,
  );
}

async function releaseMutex(mutex) {
  await mutex.fileHandle.close().catch(() => undefined);
  try {
    const current = await lstat(mutex.filePath);
    if (current.dev === mutex.fileStat.dev && current.ino === mutex.fileStat.ino) {
      await unlink(mutex.filePath);
    }
  } catch (error) {
    if (!hasErrorCode(error, "ENOENT")) throw error;
  }
}

function samePayload(left, right) {
  return left.version === right.version
    && left.writerId === right.writerId
    && left.pid === right.pid
    && left.hostname === right.hostname
    && left.leaseId === right.leaseId
    && left.ownerTokenHash === right.ownerTokenHash
    && left.createdAt === right.createdAt
    && left.dataRoot === right.dataRoot
    && left.childPids.length === right.childPids.length
    && left.childPids.every((pid, index) => pid === right.childPids[index]);
}

function inspectPid(pid) {
  try {
    process.kill(pid, 0);
    return "alive";
  } catch (error) {
    if (hasErrorCode(error, "ESRCH")) return "dead";
    return "unknown";
  }
}

function assertLeaseIsRecoverable(payload, localHostname) {
  if (payload.hostname !== localHostname) {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.FOREIGN_HOST,
      "Planning writer lease belongs to a different host.",
    );
  }

  const statuses = [payload.pid, ...payload.childPids].map(inspectPid);
  if (statuses.includes("alive")) {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.HELD,
      "Planning writer lease is held by a live process.",
    );
  }
  if (statuses.includes("unknown")) {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.OWNER_UNKNOWN,
      "Planning writer lease process state is unknown.",
    );
  }
}

async function recoverStaleLease(context, observedPayload, localHostname) {
  assertLeaseIsRecoverable(observedPayload, localHostname);
  const recoveryMutex = await acquireMutex(
    context.recoveryMutexPath,
    PLANNING_WRITER_LEASE_ERROR_CODES.RECOVERY_BUSY,
    "recovery",
  );

  try {
    const updateMutex = await acquireMutex(
      context.updateMutexPath,
      PLANNING_WRITER_LEASE_ERROR_CODES.UPDATE_BUSY,
      "update",
    );
    try {
      const currentPayload = await readLeasePayload(context.lockPath, context.dataRoot);
      if (!samePayload(observedPayload, currentPayload)) {
        throw leaseError(
          PLANNING_WRITER_LEASE_ERROR_CODES.STATE_CHANGED,
          "Planning writer lease changed during stale recovery.",
        );
      }
      assertLeaseIsRecoverable(currentPayload, localHostname);
      await unlink(context.lockPath);
    } finally {
      await releaseMutex(updateMutex);
    }
  } finally {
    await releaseMutex(recoveryMutex);
  }
}

async function replaceLeasePayload(context, observedPayload, nextPayload) {
  const temporaryPath = path.join(
    context.runtimePath,
    `.writer-lease.${process.pid}.${randomUUID()}.tmp`,
  );
  let temporaryHandle;
  try {
    temporaryHandle = await open(temporaryPath, "wx", 0o600);
    await temporaryHandle.writeFile(serializedPayload(nextPayload), "utf8");
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = undefined;

    const currentPayload = await readLeasePayload(context.lockPath, context.dataRoot);
    if (!samePayload(observedPayload, currentPayload)) {
      throw leaseError(
        PLANNING_WRITER_LEASE_ERROR_CODES.STATE_CHANGED,
        "Planning writer lease changed during update.",
      );
    }
    await rename(temporaryPath, context.lockPath);
  } finally {
    await temporaryHandle?.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
  }
}

function assertCapabilityMatches(payload, capability) {
  const parsed = parseCapability(capability);
  if (parsed.leaseId !== payload.leaseId
    || !tokenHashMatches(payload.ownerTokenHash, parsed.ownerToken)) {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.CAPABILITY_INVALID,
      "Planning writer lease capability does not match the active lease.",
    );
  }
  return parsed;
}

async function readCapabilityLease(input) {
  if (!input || typeof input !== "object") {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.INPUT_INVALID,
      "Planning writer lease capability input is required.",
    );
  }
  const context = await canonicalLeaseContext(input.dataRoot);
  let payload;
  try {
    payload = await readLeasePayload(context.lockPath, context.dataRoot);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      throw leaseError(
        PLANNING_WRITER_LEASE_ERROR_CODES.NOT_FOUND,
        "Planning writer lease does not exist.",
      );
    }
    throw error;
  }
  assertCapabilityMatches(payload, input.capability);
  return { context, payload };
}

function createLeaseHandle(payload, ownerToken, context) {
  let released = false;
  const publicMetadata = frozenMetadata(payload);
  const handle = { ...publicMetadata };

  Object.defineProperties(handle, {
    capability: {
      enumerable: false,
      get() {
        return createCapability(payload.leaseId, ownerToken);
      },
    },
    release: {
      enumerable: false,
      value: async () => {
        if (released) return false;
        const updateMutex = await acquireMutex(
          context.updateMutexPath,
          PLANNING_WRITER_LEASE_ERROR_CODES.UPDATE_BUSY,
          "update",
        );
        try {
          let currentPayload;
          try {
            currentPayload = await readLeasePayload(context.lockPath, context.dataRoot);
          } catch (error) {
            if (hasErrorCode(error, "ENOENT")) return false;
            throw error;
          }
          if (currentPayload.leaseId !== payload.leaseId
            || !tokenHashMatches(currentPayload.ownerTokenHash, ownerToken)) {
            throw leaseError(
              PLANNING_WRITER_LEASE_ERROR_CODES.RELEASE_NOT_OWNER,
              "Planning writer lease release was rejected because ownership changed.",
            );
          }

          const recheckedPayload = await readLeasePayload(context.lockPath, context.dataRoot);
          if (!samePayload(currentPayload, recheckedPayload)) {
            throw leaseError(
              PLANNING_WRITER_LEASE_ERROR_CODES.STATE_CHANGED,
              "Planning writer lease changed during release.",
            );
          }
          await unlink(context.lockPath);
          released = true;
          return true;
        } finally {
          await releaseMutex(updateMutex);
        }
      },
    },
    toJSON: {
      enumerable: false,
      value: () => publicMetadata,
    },
  });

  return Object.freeze(handle);
}

export async function acquirePlanningWriterLease(input) {
  if (!input || typeof input !== "object") {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.INPUT_INVALID,
      "Planning writer lease input is required.",
    );
  }

  const context = await canonicalLeaseContext(input.dataRoot);
  const writerId = assertNonEmptyString(input.writerId, "writerId", 256).trim();
  const pid = assertPid(input.pid ?? process.pid, "pid");
  const hostname = assertNonEmptyString(input.hostname ?? os.hostname(), "hostname", 256).trim();
  const ownerToken = input.ownerToken ?? randomBytes(32).toString("base64url");
  assertNonEmptyString(ownerToken, "ownerToken");

  const payload = frozenMetadata({
    version: PLANNING_WRITER_LEASE_VERSION,
    writerId,
    pid,
    hostname,
    leaseId: randomUUID(),
    ownerTokenHash: ownerTokenHash(ownerToken),
    createdAt: new Date().toISOString(),
    dataRoot: context.dataRoot,
    childPids: [],
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await createLeaseFile(context.lockPath, payload);
      return createLeaseHandle(payload, ownerToken, context);
    } catch (error) {
      if (!hasErrorCode(error, "EEXIST")) throw error;
    }

    let observedPayload;
    try {
      observedPayload = await readLeasePayload(context.lockPath, context.dataRoot);
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) continue;
      throw error;
    }

    await recoverStaleLease(context, observedPayload, hostname);
  }

  throw leaseError(
    PLANNING_WRITER_LEASE_ERROR_CODES.STATE_UNKNOWN,
    "Planning writer lease could not be acquired after concurrent state changes.",
  );
}

export async function verifyPlanningWriterLeaseCapability(input) {
  const { payload } = await readCapabilityLease(input);
  return payload;
}

export async function registerPlanningWriterLeaseChild(input) {
  if (!input || typeof input !== "object") {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.INPUT_INVALID,
      "Planning writer lease child registration input is required.",
    );
  }
  const childPid = assertPid(input.childPid, "childPid");
  const childStatus = inspectPid(childPid);
  if (childStatus === "dead") {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.CHILD_NOT_ALIVE,
      "Planning writer lease child process is not alive.",
    );
  }
  if (childStatus === "unknown") {
    throw leaseError(
      PLANNING_WRITER_LEASE_ERROR_CODES.CHILD_STATUS_UNKNOWN,
      "Planning writer lease child process state is unknown.",
    );
  }

  const context = await canonicalLeaseContext(input.dataRoot);
  const updateMutex = await acquireMutex(
    context.updateMutexPath,
    PLANNING_WRITER_LEASE_ERROR_CODES.UPDATE_BUSY,
    "update",
  );
  try {
    let payload;
    try {
      payload = await readLeasePayload(context.lockPath, context.dataRoot);
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) {
        throw leaseError(
          PLANNING_WRITER_LEASE_ERROR_CODES.NOT_FOUND,
          "Planning writer lease does not exist.",
        );
      }
      throw error;
    }
    assertCapabilityMatches(payload, input.capability);
    if (payload.childPids.includes(childPid)) return payload;

    const nextPayload = frozenMetadata({
      ...payload,
      childPids: [...payload.childPids, childPid].sort((left, right) => left - right),
    });
    await replaceLeasePayload(context, payload, nextPayload);
    return nextPayload;
  } finally {
    await releaseMutex(updateMutex);
  }
}
