import { type OpsActionId } from "../actions/types";

export type DoctorIssueSeverity = "risk" | "warn" | "info";

export type DoctorIssueFix = {
  label: string;
  href?: string;
  actionId?: OpsActionId;
  confirm?: string;
};

export type DoctorIssue = {
  id: string;
  severity: DoctorIssueSeverity;
  title: string;
  message: string;
  evidence?: string;
  fix?: DoctorIssueFix;
};

