export type PlanningDataRootKind = "local" | "shared" | "unknown";

export type PlanningDataRootOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
};

export function resolvePlanningDataRoot(options?: PlanningDataRootOptions): string;
export function resolvePlanningControlRoot(options?: PlanningDataRootOptions): string;
export function isObviouslySharedDataRoot(dataRoot: string, platform?: NodeJS.Platform): boolean;
export function classifyPlanningFilesystemType(value: number | bigint | null | undefined): PlanningDataRootKind;
export function classifyPlanningWindowsDriveType(value: string | null | undefined): PlanningDataRootKind;
export function inspectPlanningDataRoot(
  options?: PlanningDataRootOptions & { dataRoot?: string },
): Promise<Readonly<{
  dataRoot: string;
  dataRootKind: PlanningDataRootKind;
  filesystemType: number | null;
}>>;
export function resolvePlanningDatabaseFacts(env?: NodeJS.ProcessEnv): Readonly<{
  databaseProvider: "sqlite" | "unknown";
  databaseConnection: "file" | "network" | "unknown";
}>;
