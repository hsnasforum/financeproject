export type PlanningFeedbackCategory = "bug" | "ux" | "data" | "other";
export type PlanningFeedbackStatus = "new" | "triaged" | "doing" | "done";
export type PlanningFeedbackPriority = "p0" | "p1" | "p2" | "p3";

export type PlanningFeedback = {
  version: 1;
  id: string;
  createdAt: string;
  from: { screen: string };
  context: {
    snapshot?: { id?: string; asOf?: string; fetchedAt?: string; missing?: boolean };
    runId?: string;
    reportId?: string;
    health?: { criticalCount?: number; warningsCodes?: string[] };
  };
  content: {
    category: PlanningFeedbackCategory;
    title: string;
    message: string;
  };
  triage: {
    status: PlanningFeedbackStatus;
    priority: PlanningFeedbackPriority;
    tags: string[];
    due?: string;
  };
  link?: {
    githubIssue?: {
      number: number;
      url: string;
      createdAt: string;
    };
  };
};

export type PlanningFeedbackCreateInput = {
  from: { screen: string };
  context?: PlanningFeedback["context"];
  content: PlanningFeedback["content"];
};

export type PlanningFeedbackUpdatePatch = {
  triage?: Partial<PlanningFeedback["triage"]>;
  link?: Partial<NonNullable<PlanningFeedback["link"]>>;
};
