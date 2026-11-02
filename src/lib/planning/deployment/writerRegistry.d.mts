export const PLANNING_RUNTIME_WRITER_IDS: readonly string[];
export const PLANNING_MUTATING_PACKAGE_SCRIPTS: readonly string[];
export const PLANNING_READ_ONLY_PACKAGE_SCRIPTS: readonly string[];
export const PLANNING_DISABLED_WRITER_SCRIPTS: readonly string[];
export function isPlanningWriterId(value: unknown): boolean;
export function assertPlanningWriterId(value: unknown): string;
