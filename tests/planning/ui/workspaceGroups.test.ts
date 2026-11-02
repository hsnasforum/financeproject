import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanningWorkspaceClient } from "../../../src/components/PlanningWorkspaceClient";
import type { PlanningWorkspaceClientProps } from "../../../src/components/planning/workspace/usePlanningWorkspaceController";
import type { PlanningWorkspaceGroups } from "../../../src/components/planning/workspace/groups";
import { createInitialDiagnosisState, validateDiagnosisStep } from "../../../src/lib/planning/ui/planningDiagnosisWizard";

const { panelProps, searchParamsMock, usePlanningWorkspaceControllerMock } = vi.hoisted(() => ({
  panelProps: {
    top: [] as unknown[],
    profile: [] as unknown[],
    execution: [] as unknown[],
    results: [] as unknown[],
    modal: [] as unknown[],
  },
  searchParamsMock: { current: null as URLSearchParams | null },
  usePlanningWorkspaceControllerMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock.current,
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
    searchParamsMock.current = null;
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
    expect(html).toMatch(/<a [^>]*href="\/planning\/v3\/transactions\/batches"[^>]*>거래 기반 상담 초안\(베타\)<\/a>/);
    expect(panelProps.top).toEqual([{ quickStart, actions }]);
    expect(panelProps.profile).toEqual([{ profile, actions }]);
    expect(panelProps.execution).toEqual([{ execution, actions }]);
    expect(panelProps.results).toEqual([{ results, actions }]);
    expect(panelProps.modal).toEqual([{ dialogs, actions }]);
  });

  describe("entry boundary", () => {
    const featureFlags: PlanningWorkspaceClientProps["featureFlags"] = {
      debugEnabled: false,
      ecosEnabled: true,
      monteCarloEnabled: true,
      includeProductsEnabled: false,
      optimizerEnabled: false,
      pdfEnabled: false,
    };

    function renderEntry(input: {
      initialSelectedProfileId?: string;
      view?: string;
      beginnerMode?: boolean;
      beginnerModeLoaded?: boolean;
    }): string {
      const state = createInitialDiagnosisState();
      usePlanningWorkspaceControllerMock.mockReturnValue({
        quickStart: {
          selectedProfileId: "",
          profiles: [],
          runsPageHref: "/planning/runs",
          reportsPageHref: "/planning/reports",
          beginnerMode: input.beginnerMode ?? true,
          beginnerModeLoaded: input.beginnerModeLoaded ?? true,
        },
        profile: { id: "profile-group" },
        execution: { id: "execution-group" },
        results: { id: "results-group" },
        dialogs: { id: "dialogs-group" },
        actions: {},
        diagnosisWizard: {
          state,
          dirty: false,
          issues: validateDiagnosisStep(state.draft, 1),
          showIssues: false,
          guard: { blockers: [], warnings: [], signature: "" },
          conditions: [],
          appliedDefaults: [],
          summary: [],
          canSubmit: false,
          goNext: vi.fn(),
          goPrevious: vi.fn(),
          dispatch: vi.fn(),
          loadExample: vi.fn(),
          requestReset: vi.fn(),
          submit: vi.fn(),
        },
      });
      searchParamsMock.current = input.view ? new URLSearchParams({ view: input.view }) : new URLSearchParams();
      return renderToStaticMarkup(createElement(PlanningWorkspaceClient, {
        featureFlags,
        locale: "ko-KR",
        initialSelectedProfileId: input.initialSelectedProfileId ?? "",
        snapshotItems: { history: [] },
      }));
    }

    it("opens the blank wizard instead of the existing panels for a new beginner visit", () => {
      const html = renderEntry({});

      expect(html).toContain("data-testid=\"planning-diagnosis-wizard\"");
      expect(html).toMatch(/<a [^>]*href="\/planning\?view=full"[^>]*>전체 입력 화면<\/a>/);
      expect(html).not.toContain("현재 작업 프로필");
      expect(panelProps.top).toEqual([]);
      expect(panelProps.profile).toEqual([]);
      expect(panelProps.execution).toEqual([]);
      expect(panelProps.results).toEqual([]);
    });

    it("keeps the full input screen for view=full and links back to the wizard", () => {
      const html = renderEntry({ view: "full" });

      expect(html).not.toContain("data-testid=\"planning-diagnosis-wizard\"");
      expect(panelProps.profile).toHaveLength(1);
      expect(panelProps.execution).toHaveLength(1);
      expect(html).toContain("현재 작업 프로필");
      expect(html).toMatch(/<a [^>]*href="\/planning"[^>]*>단계별 새 진단으로 돌아가기<\/a>/);
    });

    it("keeps the full input screen for an explicit profile with no extra link", () => {
      const html = renderEntry({ initialSelectedProfileId: "profile-1" });

      expect(html).not.toContain("data-testid=\"planning-diagnosis-wizard\"");
      expect(html).not.toContain("단계별 새 진단으로 돌아가기");
      expect(panelProps.profile).toHaveLength(1);
    });

    it("keeps the full input screen in advanced mode", () => {
      const html = renderEntry({ beginnerMode: false });

      expect(html).not.toContain("data-testid=\"planning-diagnosis-wizard\"");
      expect(panelProps.profile).toHaveLength(1);
    });

    it("shows neither screen until the stored mode is known", () => {
      const html = renderEntry({ beginnerModeLoaded: false });

      expect(html).not.toContain("data-testid=\"planning-diagnosis-wizard\"");
      expect(html).toContain("재무 진단 화면을 준비하고 있습니다.");
      expect(panelProps.profile).toEqual([]);
    });

    it("marks the wizard and pending screens so navigation recovery does not treat them as blank", () => {
      const arrivalMarker = "data-planning-navigation-state=\"/planning\"";

      expect(renderEntry({})).toContain(arrivalMarker);
      expect(renderEntry({ beginnerModeLoaded: false })).toContain(arrivalMarker);
    });

    it("keeps the planning input anchor on the wizard for existing in-page links", () => {
      expect(renderEntry({}).match(/id="planning-input-section"/g)).toHaveLength(1);
    });
  });
});
