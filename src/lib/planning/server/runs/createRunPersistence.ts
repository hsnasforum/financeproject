import {
  type createCurrentUserRunResponseData,
  type CurrentUserRunRecord,
} from "./routeService";

export type CreateRunRecord = typeof createCurrentUserRunResponseData;
export type CreateRunRecordInput = Parameters<CreateRunRecord>[0];
export type CreateRunRecordOptions = NonNullable<Parameters<CreateRunRecord>[1]>;

export type CreateRunPersistenceEnv = Readonly<Record<string, string | undefined> & {
  PLANNING_RUN_STORE_RAW_OUTPUTS?: string;
}>;

export function shouldStoreRawPlanningRunOutputs(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

export function resolveCreateRunPersistenceOptions(
  env: CreateRunPersistenceEnv = process.env,
): CreateRunRecordOptions {
  return {
    storeRawOutputs: shouldStoreRawPlanningRunOutputs(env.PLANNING_RUN_STORE_RAW_OUTPUTS),
  };
}

export async function persistCreatePlanningRunRecord(input: {
  createRunRecord: CreateRunRecord;
  recordInput: CreateRunRecordInput;
  env?: CreateRunPersistenceEnv;
}): Promise<CurrentUserRunRecord> {
  return input.createRunRecord(
    input.recordInput,
    resolveCreateRunPersistenceOptions(input.env),
  );
}
