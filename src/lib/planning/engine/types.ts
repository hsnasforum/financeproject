export type Stage = "DEFICIT" | "DEBT" | "EMERGENCY" | "INVEST";

export interface EngineInput {
  monthlyIncome: number;
  monthlyExpense: number;
  age?: number;
  liquidAssets?: number;
  debtBalance?: number;
  emergencyFundMonths?: number;
}

export interface EngineTrace {
  savingCapacity: number;
  savingRate: number | null;
  liquidAssets: number;
  debtBalance: number;
  emergencyFundTarget: number;
  emergencyFundGap: number;
  triggeredRules: string[];
}

export interface FinancialStatus {
  stage: Stage;
  trace: EngineTrace;
}

export interface StageDecision {
  priority: "CUT_SPENDING" | "PAY_DEBT" | "BUILD_EMERGENCY_FUND" | "INVEST";
  investmentAllowed: boolean;
  warnings: string[];
}

export interface EngineEnvelope {
  stage: Stage;
  financialStatus: FinancialStatus;
  stageDecision: StageDecision;
}

export interface EngineContext {
  status: FinancialStatus;
  decision: StageDecision;
}

export interface EngineResult<TCore = unknown> {
  input: EngineInput;
  status: FinancialStatus;
  decision: StageDecision;
  core: TCore;
  generatedAt: string;
}
