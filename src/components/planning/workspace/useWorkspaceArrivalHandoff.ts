"use client";

import { useEffect, useRef } from "react";
import { focusWorkspaceQuickStartTarget } from "@/app/planning/_lib/workspaceQuickStart";
import {
  shouldAutoFocusPlanningQuickStartTarget,
  shouldCompletePlanningQuickStartFocusAttempt,
} from "@/components/planning/workspace/controllerUtils";

type WorkspaceArrivalHandoffInput = {
  initialArrivalProfileId: string;
  loadingProfiles: boolean;
  selectedProfileId: string;
  targetId?: string;
};

export function useWorkspaceArrivalHandoff({
  initialArrivalProfileId,
  loadingProfiles,
  selectedProfileId,
  targetId,
}: WorkspaceArrivalHandoffInput): void {
  const arrivalHandoffCompletedRef = useRef(false);
  const arrivalHandoffCancelledRef = useRef(false);
  const arrivalHandoffCompletedTargetRef = useRef("");

  useEffect(() => {
    arrivalHandoffCompletedRef.current = false;
    arrivalHandoffCancelledRef.current = false;
    arrivalHandoffCompletedTargetRef.current = "";
  }, [initialArrivalProfileId]);

  useEffect(() => {
    if (!targetId) return;
    if (!arrivalHandoffCompletedRef.current) return;
    if (arrivalHandoffCancelledRef.current) return;
    if (arrivalHandoffCompletedTargetRef.current === targetId) return;
    arrivalHandoffCompletedRef.current = false;
    arrivalHandoffCompletedTargetRef.current = "";
  }, [targetId]);

  useEffect(() => {
    if (!initialArrivalProfileId) return;

    function cancelArrivalHandoff(): void {
      arrivalHandoffCancelledRef.current = true;
    }

    window.addEventListener("pointerdown", cancelArrivalHandoff, true);
    window.addEventListener("keydown", cancelArrivalHandoff, true);
    window.addEventListener("wheel", cancelArrivalHandoff, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", cancelArrivalHandoff, true);
      window.removeEventListener("keydown", cancelArrivalHandoff, true);
      window.removeEventListener("wheel", cancelArrivalHandoff, true);
    };
  }, [initialArrivalProfileId]);

  useEffect(() => {
    if (!shouldAutoFocusPlanningQuickStartTarget({
      initialArrivalProfileId,
      loadingProfiles,
      arrivalHandoffCompleted: arrivalHandoffCompletedRef.current,
      arrivalHandoffCancelled: arrivalHandoffCancelledRef.current,
      targetId,
      selectedProfileId,
    })) return;

    const focusTargetId = targetId;
    if (!focusTargetId) return;

    let frameId = 0;
    let timeoutId = 0;
    let attempts = 0;
    const maxAttempts = 40;

    const focusWhenReady = () => {
      if (arrivalHandoffCompletedRef.current || arrivalHandoffCancelledRef.current) return;
      const moved = focusWorkspaceQuickStartTarget(focusTargetId);
      const targetFocused = document.activeElement instanceof HTMLElement
        && document.activeElement.id === focusTargetId;
      attempts += 1;
      if (shouldCompletePlanningQuickStartFocusAttempt({ moved, targetFocused })) {
        arrivalHandoffCompletedRef.current = true;
        arrivalHandoffCompletedTargetRef.current = focusTargetId;
        return;
      }
      if (attempts >= maxAttempts) return;
      timeoutId = window.setTimeout(() => {
        frameId = window.requestAnimationFrame(focusWhenReady);
      }, moved ? 100 : 50);
    };

    frameId = window.requestAnimationFrame(focusWhenReady);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [
    initialArrivalProfileId,
    loadingProfiles,
    selectedProfileId,
    targetId,
  ]);
}
