import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanningWorkspaceClient } from "../../../src/components/PlanningWorkspaceClient";
import type { PlanningWorkspaceClientProps } from "../../../src/components/planning/workspace/usePlanningWorkspaceController";
import type { PlanningWorkspaceGroups } from "../../../src/components/planning/workspace/groups";

const { panelProps, usePlanningWorkspaceControllerMock } = vi.hoisted(() => ({
  panelProps: {
    top: [] as unknown[],
    profile: [] as unknown[],
    execution: [] as unknown[],
    results: [] as unknown[],
    modal: [] as unknown[],
  },
  usePlanningWorkspaceControllerMock: vi.fn(),
}));

vi.mock("@/components/planning/workspace/usePlanningWorkspaceController", () => ({
  usePlanningWorkspaceController: usePlanningWorkspaceControllerMock,
}));

vi.mock("@/components/planning/workspace/panels", () => ({
  PlanningWorkspaceTopSurfacePanel: (props: unknown) => {
    panelProps.top.push(props);
    return null;
  },
  PlanningWorkspaceProfilePanel: (props: unknown) => {
    panelProps.profile.push(props);
    return null;
  },
  PlanningWorkspaceExecutionPanel: (props: unknown) => {
    panelProps.execution.push(props);
    return null;
  },
  PlanningWorkspaceResultsPanel: (props: unknown) => {
    panelProps.results.push(props);
    return null;
  },
  PlanningWorkspaceModalPanel: (props: unknown) => {
    panelProps.modal.push(props);
    return null;
  },
}));

describe("planning workspace groups", () => {
  beforeEach(() => {
    panelProps.top.length = 0;
    panelProps.profile.length = 0;
    panelProps.execution.length = 0;
    panelProps.results.length = 0;
    panelProps.modal.length = 0;
    usePlanningWorkspaceControllerMock.mockReset();
  });

  it("preserves grouped bindings for route-facing panels", () => {
    const actions = {
      setSelectedProfileId: vi.fn(),
      setFeedbackModalOpen: vi.fn(),
    } as unknown as PlanningWorkspaceGroups["actions"];
    const quickStart = {
      selectedProfileId: "profile-1",
      profiles: [{ id: "profile-1", name: "프로필 A" }],
      runsPageHref: "/planning/runs?profileId=profile-1",
      reportsPageHref: "/planning/reports?profileId=profile-1",
    } as unknown as PlanningWorkspaceGroups["quickStart"];
    const profile = { id: "profile-group" } as unknown as PlanningWorkspaceGroups["profile"];
    const execution = { id: "execution-group" } as unknown as PlanningWorkspaceGroups["execution"];
    const results = { id: "results-group" } as unknown as PlanningWorkspaceGroups["results"];
    const dialogs = { id: "dialogs-group" } as unknown as PlanningWorkspaceGroups["dialogs"];
    const featureFlags: PlanningWorkspaceClientProps["featureFlags"] = {
      debugEnabled: false,
      ecosEnabled: true,
      monteCarloEnabled: true,
      includeProductsEnabled: false,
      optimizerEnabled: false,
      pdfEnabled: false,
    };
    const locale: PlanningWorkspaceClientProps["locale"] = "ko-KR";

    const controller = {
      quickStart,
      profile,
      execution,
      results,
      dialogs,
      actions,
    } as PlanningWorkspaceGroups;

    usePlanningWorkspaceControllerMock.mockReturnValue(controller);

    const html = renderToStaticMarkup(createElement(PlanningWorkspaceClient, {
      featureFlags,
      locale,
      initialSelectedProfileId: "profile-1",
      snapshotItems: { history: [] },
      csrf: "csrf-token",
    }));

    expect(usePlanningWorkspaceControllerMock).toHaveBeenCalledWith({
      featureFlags,
      locale,
      initialSelectedProfileId: "profile-1",
      initialSelectedProfile: null,
      snapshotItems: { history: [] },
      csrf: "csrf-token",
    });
    expect(html).toContain("프로필 A");
    expect(html).toContain("href=\"/planning/runs?profileId=profile-1\"");
    expect(html).toContain("href=\"/planning/reports?profileId=profile-1\"");
    expect(panelProps.top).toEqual([{ quickStart, actions }]);
    expect(panelProps.profile).toEqual([{ profile, actions }]);
    expect(panelProps.execution).toEqual([{ execution, actions }]);
    expect(panelProps.results).toEqual([{ results, actions }]);
    expect(panelProps.modal).toEqual([{ dialogs, actions }]);
  });
});
