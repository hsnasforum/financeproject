import { type UnifiedSourceId } from "@/lib/sources/types";

export type RecommendKind = "deposit" | "saving";
export type CandidateSource = "finlife" | "datago_kdb";
export type CandidatePool = "legacy" | "unified";
export type DepositProtectionMode = "any" | "prefer" | "require";

export type RateMode = "max" | "base" | "simple";

export type LiquidityPref = "low" | "mid" | "high";

export type RecommendPurpose = "emergency" | "seed-money" | "long-term";

export type RecommendWeights = {
  rate: number;
  term: number;
  liquidity: number;
};

export type UserRecommendProfile = {
  purpose: RecommendPurpose;
  kind: RecommendKind;
  preferredTerm: 3 | 6 | 12 | 24 | 36;
  liquidityPref: LiquidityPref;
  rateMode: RateMode;
  topN: number;
  weights?: Partial<RecommendWeights>;
  candidateSources?: CandidateSource[];
  candidatePool?: CandidatePool;
  depositProtection?: DepositProtectionMode;
};

export type ContributionKey = "rate" | "term" | "liquidity";

export type ScoreBreakdownItem = {
  key: ContributionKey;
  label: string;
  raw: number;
  weight: number;
  contribution: number;
  reason: string;
};

export type SelectedOption = {
  saveTrm: string | null;
  termMonths: number | null;
  appliedRate: number;
  baseRate: number | null;
  maxRate: number | null;
  rateSource: "intr_rate2" | "intr_rate" | "none";
  reasons: string[];
};

export type RecommendationAssumptions = {
  rateSelectionPolicy: string;
  liquidityPolicy: string;
  normalizationPolicy: string;
};

export type RecommendDetailProduct = {
  fin_prdt_cd: string;
  fin_co_no?: string;
  kor_co_nm?: string;
  fin_prdt_nm?: string;
  options: Array<{
    save_trm?: string;
    intr_rate?: number | null;
    intr_rate2?: number | null;
    raw: Record<string, unknown>;
  }>;
  best?: {
    save_trm?: string;
    intr_rate2?: number | null;
    intr_rate?: number | null;
  };
  raw: Record<string, unknown>;
};

export type RecommendedItem = {
  sourceId: UnifiedSourceId;
  kind: RecommendKind;
  finPrdtCd: string;
  providerName: string;
  productName: string;
  finalScore: number;
  selectedOption: SelectedOption;
  breakdown: ScoreBreakdownItem[];
  reasons: string[];
  detailProduct?: RecommendDetailProduct;
  signals?: {
    depositProtection?: "matched" | "unknown";
  };
  badges?: string[];
};

export type RecommendDebug = {
  candidateCount: number;
  rateMin: number;
  rateMax: number;
};

export const DEFAULT_WEIGHTS: RecommendWeights = {
  rate: 0.55,
  term: 0.3,
  liquidity: 0.15,
};

export const DEFAULT_TOP_N = 10;
