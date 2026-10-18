export const STANDALONE_PRIVACY_RECEIPT: string;
export const STANDALONE_PRIVACY_RECEIPT_VERSION: number;
export const TRACE_COPY_FAILURE_PATTERN: RegExp;
export function createTraceCopyFailureDetector(): {
  push(stream: "stdout" | "stderr", chunk: string | Uint8Array): boolean;
  readonly seen: boolean;
};
export const SOURCE_ONLY_STANDALONE_ALIASES: readonly string[];
export type PrivacyViolation = { code: string; path: string };
export type PrivacyAuditResult = {
  ok: boolean;
  violationCount: number;
  violationsByCode: Record<string, number> | { trace: Record<string, number>; standalone: Record<string, number> };
  violations: PrivacyViolation[];
  counts: Record<string, number>;
};
export type StandaloneAuditPhase = "build" | "source-input" | "artifact-final";
export type StandalonePrivacyReceipt = {
  version: number;
  distDir: string;
  buildId: string;
  issuedAt: string;
  summary: Record<string, unknown>;
};
export function classifyPrivatePath(relativePath: string): string | null;
export function auditBuildTraces(options: { projectRoot: string; distDir?: string }): PrivacyAuditResult;
export function auditStandaloneTree(options: {
  standaloneDir: string;
  phase: StandaloneAuditPhase;
  projectRoot?: string;
  distDir?: string;
}): PrivacyAuditResult;
export function auditArtifactTree(options: { artifactDir: string }): PrivacyAuditResult;
export function auditStandaloneBuild(options: { projectRoot: string; distDir?: string }): PrivacyAuditResult;
export function formatPrivacyViolations(result: PrivacyAuditResult, limit?: number): string;
export function removeGeneratedStandaloneEnv(options: { projectRoot: string; distDir?: string }): { removed: boolean };
export function invalidateStandalonePrivacyReceipt(options: { projectRoot: string; distDir?: string }): boolean;
export function writeStandalonePrivacyReceipt(options: {
  projectRoot: string;
  distDir?: string;
  summary?: Record<string, unknown>;
}): StandalonePrivacyReceipt;
export function verifyStandalonePrivacyReceipt(options: { projectRoot: string; distDir?: string }): StandalonePrivacyReceipt;
export function verifySourceRuntimePrivacyReceipt(options: {
  projectRoot: string;
  standaloneDistDir?: string;
  requestedDistDir?: string;
  managedInstallation?: boolean;
}): { checked: false; reason: string } | { checked: true; distDir: string; buildId: string };
