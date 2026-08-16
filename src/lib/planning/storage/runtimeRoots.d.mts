export type PlanningRuntimePlatform = "linux" | "darwin" | "win32";

export type PlanningRuntimeRootInput = Readonly<{
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  platform: PlanningRuntimePlatform;
  homeDir: string;
}>;

export type PlanningRuntimeRoots = Readonly<{
  mode: "development" | "explicit" | "production" | "packaged";
  planningRoot: string;
  runtimeRoot: string;
  controlRoot: string;
}>;

export declare function sanitizePlanningAppName(value: unknown): string;
export declare function isPlanningPackagedRuntime(
  env: Readonly<Record<string, string | undefined>>,
): boolean;
export declare function normalizePlanningRuntimePlatform(value: NodeJS.Platform | string): PlanningRuntimePlatform;
export declare function resolvePlanningRuntimeRoots(
  input: PlanningRuntimeRootInput,
): PlanningRuntimeRoots;
export declare function resolvePlanningLegacyServerProductionRoot(
  input: PlanningRuntimeRootInput,
): string;
