export type AutoMergeCheckState = "PASS" | "PENDING" | "FAIL" | "UNKNOWN";

export type AutoMergeCheckItem = {
  name: string;
  state: AutoMergeCheckState;
  detail: string;
};

export type AutoMergeViewCandidate = {
  number: number;
  title: string;
  prUrl: string;
  labels: string[];
  state: string;
  draft: boolean;
  headSha: string;
  headRef: string;
  author: string;
  updatedAt: string;
  expectedConfirmText: string;
  eligibility: {
    ok: boolean;
    reasons: string[];
  };
  checks: {
    summary: AutoMergeCheckState;
    source: "check-runs" | "status" | "unknown";
    total: number;
    passed: number;
    failed: number;
    pending: number;
    items: AutoMergeCheckItem[];
  };
};
