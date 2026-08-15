export const PLANNING_DEPLOYMENT_MODES: readonly [
  "desktop-local",
  "web-single",
  "web-multi",
];

export type PlanningDeploymentMode = (typeof PLANNING_DEPLOYMENT_MODES)[number];

export type PlanningDeploymentPolicyInput = {
  mode: string | undefined;
  requestedBindHost: string | undefined;
  singleUserModeEnabled: boolean;
  /** Raw PLANNING_NAMESPACE_ENABLED fact, not the effective users/default layout. */
  namespaceEnabled: boolean;
  forwardedHeadersTrusted: boolean;
  rawTrustedAuthHeadersEnabled: boolean;
  desktopLocalIdentityMode: "desktop-local-session" | "other" | "unknown";
  desktopLocalIdentityProvenance: "launcher-process" | "other" | "unknown";
  desktopLocalIdentityReady: boolean;
  databaseProvider: "sqlite" | "postgresql" | "unknown";
  databaseConnection: "file" | "network" | "unknown";
  processModel: "single" | "multi" | "unknown";
  dataRootKind: "local" | "shared" | "unknown";
  proxyMode: "none" | "trusted" | "untrusted" | "unknown";
};

export type PlanningDeploymentPolicyConflict =
  | "requestedBindHost"
  | "proxyMode"
  | "forwardedHeadersTrusted"
  | "rawTrustedAuthHeadersEnabled"
  | "desktopLocalIdentityMode"
  | "desktopLocalIdentityProvenance"
  | "processModel"
  | "singleUserModeEnabled"
  | "namespaceEnabled"
  | "dataRootKind"
  | "databaseProvider"
  | "databaseConnection"
  | "desktopLocalIdentityReady";

export type PlanningDeploymentPolicyErrorCode =
  | "DEPLOYMENT_MODE_MISSING"
  | "DEPLOYMENT_MODE_UNKNOWN"
  | "DEPLOYMENT_MODE_UNSUPPORTED"
  | "DEPLOYMENT_POLICY_CONFLICT"
  | "DEPLOYMENT_AUTH_NOT_READY";

export type PlanningDeploymentPolicyDecision =
  | {
      readonly ok: true;
      readonly mode: "desktop-local";
      readonly bindHost: "127.0.0.1";
      readonly localOnly: true;
      readonly remoteAccessAllowed: false;
      readonly proxyTrust: "none";
      readonly forwardedHeadersTrusted: false;
      readonly processModel: "single";
      readonly singleWriter: true;
      readonly dataRootKind: "local";
      readonly userScope: "default";
      readonly databaseProvider: "sqlite";
      readonly databaseConnection: "file";
      readonly identityMode: "desktop-local-session";
      readonly identityProvenance: "launcher-process";
      readonly rawTrustedAuthHeadersAllowed: false;
      readonly restoreApplyAllowed: false;
    }
  | {
      readonly ok: false;
      readonly code: PlanningDeploymentPolicyErrorCode;
      readonly message: string;
      readonly conflicts?: readonly PlanningDeploymentPolicyConflict[];
    };

export function resolvePlanningDeploymentPolicy(
  input: PlanningDeploymentPolicyInput,
): PlanningDeploymentPolicyDecision;
