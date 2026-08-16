export type PlanningWriterTargetClass = "archive-owner" | "user-runtime-control" | "runtime-shared-control" | "derived-cache" | "output-artifact" | "external-output" | "disabled" | "fixture" | "out-of-scope";
export type PlanningWriterTarget = Readonly<{ id: string; class: PlanningWriterTargetClass; archiveOwnerId?: string; rootKind: "planning-root" | "runtime-root" | "control-root" | "registered-owner-target" | "external-selected" | "temp-root"; logicalPath: string; pathKind: "directory" | "file" | "registered-owner-locations" | "external-selected"; namespace: "user" | "runtime-shared" | "external" | "none"; backupPolicy: "archive-owner" | "excluded-control" | "excluded-derived" | "separate-output" | "disabled" | "not-applicable"; restorePolicy: "owner-restore" | "rebuild" | "operator-only" | "disabled" | "not-applicable"; authoritative: boolean; description: string }>;
export type PlanningWriterSource = Readonly<{ id: string; sourcePath: string; kind: "server-module" | "cli-module" | "scheduler-module" | "shared-helper"; targets: readonly string[]; mutationSignals: readonly string[]; futureLeasePolicy: "inherited-runtime" | "one-shot" | "disabled" | "fixture" | "out-of-scope"; exportedBypassRisk: boolean; notes: string }>;
export type PlanningWriterEntrypoint = Readonly<{ id: string; packageScript?: string; executablePath: string; kind: "runtime-parent" | "runtime-child" | "one-shot-cli" | "scheduler-parent" | "composite-child" | "read-only" | "disabled"; sources: readonly string[]; targets: readonly string[]; childEntrypoints: readonly string[]; childCommandPaths: readonly string[]; childCommandExclusions: readonly Readonly<{ packageScript: string; reason: string }>[]; futureLeasePolicy: "parent-acquire-child-inherit" | "one-shot" | "read-only" | "disabled" | "out-of-scope" }>;
export declare const PLANNING_WRITER_REGISTRY_VERSION: 1;
export declare const PLANNING_WRITER_SOURCES: readonly PlanningWriterSource[];
export declare const PLANNING_WRITER_EXCLUSIONS: readonly Readonly<{ sourcePath: string; class: string; reason: string; targetOutsidePlanningRoot: boolean; evidence: string }>[];
export declare const PLANNING_WRITER_ENTRYPOINTS: readonly PlanningWriterEntrypoint[];
export declare function createPlanningWriterTargetRegistry(archiveOwnerIds: readonly string[]): readonly PlanningWriterTarget[];
export declare function resolvePlanningNonArchiveWriterTarget(
  targetId: string,
  input: Readonly<{
    cwd: string;
    env: Readonly<Record<string, string | undefined>>;
    platform: "linux" | "darwin" | "win32";
    homeDir: string;
    externalPath?: string;
    tempRoot?: string;
  }>,
): Readonly<{ target: PlanningWriterTarget; path: string }>;
export declare function planningWriterRegistryDigest(input: Readonly<{ targets: readonly PlanningWriterTarget[]; sources?: readonly PlanningWriterSource[]; exclusions?: readonly Readonly<{ sourcePath: string; class: string; reason: string; targetOutsidePlanningRoot: boolean; evidence: string }>[]; entrypoints?: readonly PlanningWriterEntrypoint[] }>): string;
