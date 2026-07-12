"use client";

import { useEffect, useState } from "react";
import {
  createInitialStepStatuses,
  type StepStatus,
} from "@/lib/planning/ui/runPipeline";
import {
  type WorkspaceRunMeta as PlanningMeta,
  type WorkspaceRunResult,
} from "@/lib/planning/ui/workspaceRunResult";
import { type PlanningApiEngineEnvelope } from "@/lib/planning/api/contracts";
import { type PlanningRunRecord } from "@/lib/planning/store/types";
import {
  type BaselineRunOption,
  type CurrentProfileHashState,
  type ScenarioTemplateId,
} from "@/components/planning/workspace/workspaceRuntimeHelpers";

export type MountedRef = {
  current: boolean;
};

type RuntimeStateBundleInput = {
  isMountedRef: MountedRef;
};

export function useWorkspaceRuntimeStateBundle({
  isMountedRef,
}: RuntimeStateBundleInput) {
  const [running, setRunning] = useState(false);
  const [runningOptimize, setRunningOptimize] = useState(false);
  const [pipelineStatuses, setPipelineStatuses] = useState<StepStatus[]>(() => createInitialStepStatuses());
  const [runResult, setRunResult] = useState<WorkspaceRunResult | null>(null);
  const [optimizeResult, setOptimizeResult] = useState<{
    meta?: PlanningMeta;
    engine: PlanningApiEngineEnvelope["engine"];
    engineSchemaVersion: number;
    candidates: Record<string, unknown>[];
  } | null>(null);
  const [savedRun, setSavedRun] = useState<PlanningRunRecord | null>(null);
  const [currentProfileHashState, setCurrentProfileHashState] = useState<CurrentProfileHashState>({
    input: "",
    hash: "",
  });
  const [baselineRuns, setBaselineRuns] = useState<BaselineRunOption[]>([]);
  const [loadingBaselineRuns, setLoadingBaselineRuns] = useState(false);
  const [baselineRunId, setBaselineRunId] = useState("");
  const [scenarioTemplateId, setScenarioTemplateId] = useState<ScenarioTemplateId>("NONE");
  const [activeTab, setActiveTab] = useState<"summary" | "warningsGoals" | "actions" | "scenarios" | "monteCarlo" | "debt">("summary");
  const [showAllActions, setShowAllActions] = useState(false);
  const [healthAck, setHealthAck] = useState(false);
  const [runWarningConfirmed, setRunWarningConfirmed] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, [isMountedRef]);

  return {
    running,
    setRunning,
    runningOptimize,
    setRunningOptimize,
    pipelineStatuses,
    setPipelineStatuses,
    runResult,
    setRunResult,
    optimizeResult,
    setOptimizeResult,
    savedRun,
    setSavedRun,
    currentProfileHashState,
    setCurrentProfileHashState,
    baselineRuns,
    setBaselineRuns,
    loadingBaselineRuns,
    setLoadingBaselineRuns,
    baselineRunId,
    setBaselineRunId,
    scenarioTemplateId,
    setScenarioTemplateId,
    activeTab,
    setActiveTab,
    showAllActions,
    setShowAllActions,
    healthAck,
    setHealthAck,
    runWarningConfirmed,
    setRunWarningConfirmed,
  };
}
