export const PLANNING_WRITER_LEASE_VERSION: 1;

export const PLANNING_WRITER_LEASE_ERROR_CODES: Readonly<{
  INPUT_INVALID: "PLANNING_WRITER_LEASE_INPUT_INVALID";
  HELD: "PLANNING_WRITER_LEASE_HELD";
  FOREIGN_HOST: "PLANNING_WRITER_LEASE_FOREIGN_HOST";
  OWNER_UNKNOWN: "PLANNING_WRITER_LEASE_OWNER_UNKNOWN";
  MALFORMED: "PLANNING_WRITER_LEASE_MALFORMED";
  STATE_UNKNOWN: "PLANNING_WRITER_LEASE_STATE_UNKNOWN";
  STATE_CHANGED: "PLANNING_WRITER_LEASE_STATE_CHANGED";
  RECOVERY_BUSY: "PLANNING_WRITER_LEASE_RECOVERY_BUSY";
  UPDATE_BUSY: "PLANNING_WRITER_LEASE_UPDATE_BUSY";
  NOT_FOUND: "PLANNING_WRITER_LEASE_NOT_FOUND";
  CAPABILITY_INVALID: "PLANNING_WRITER_LEASE_CAPABILITY_INVALID";
  RELEASE_NOT_OWNER: "PLANNING_WRITER_LEASE_RELEASE_NOT_OWNER";
  CHILD_NOT_ALIVE: "PLANNING_WRITER_LEASE_CHILD_NOT_ALIVE";
  CHILD_STATUS_UNKNOWN: "PLANNING_WRITER_LEASE_CHILD_STATUS_UNKNOWN";
}>;

export type PlanningWriterLeaseErrorCode =
  (typeof PLANNING_WRITER_LEASE_ERROR_CODES)[keyof typeof PLANNING_WRITER_LEASE_ERROR_CODES];

export class PlanningWriterLeaseError extends Error {
  readonly code: PlanningWriterLeaseErrorCode;
  constructor(code: PlanningWriterLeaseErrorCode, message: string);
}

export type PlanningWriterLeaseMetadata = Readonly<{
  version: 1;
  writerId: string;
  pid: number;
  hostname: string;
  leaseId: string;
  ownerTokenHash: string;
  createdAt: string;
  dataRoot: string;
  childPids: readonly number[];
}>;

export type AcquirePlanningWriterLeaseInput = {
  dataRoot: string;
  writerId: string;
  ownerToken?: string;
  pid?: number;
  hostname?: string;
};

export type PlanningWriterLeaseHandle = PlanningWriterLeaseMetadata & Readonly<{
  /** Opaque secret. Do not log or serialize this value. */
  capability: string;
  release(): Promise<boolean>;
}>;

export type PlanningWriterLeaseCapabilityInput = {
  dataRoot: string;
  /** Opaque secret returned by acquirePlanningWriterLease. */
  capability: string;
};

export type RegisterPlanningWriterLeaseChildInput = PlanningWriterLeaseCapabilityInput & {
  childPid: number;
};

export function acquirePlanningWriterLease(
  input: AcquirePlanningWriterLeaseInput,
): Promise<PlanningWriterLeaseHandle>;

export function verifyPlanningWriterLeaseCapability(
  input: PlanningWriterLeaseCapabilityInput,
): Promise<PlanningWriterLeaseMetadata>;

export function registerPlanningWriterLeaseChild(
  input: RegisterPlanningWriterLeaseChildInput,
): Promise<PlanningWriterLeaseMetadata>;
