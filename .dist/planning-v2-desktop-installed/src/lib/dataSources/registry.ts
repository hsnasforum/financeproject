export type DataSourcePriority = "P0" | "P1" | "P2";

export type DataSourceStatus = {
  state: "configured" | "missing" | "error";
  message?: string;
  updatedAt?: string;
};

export type DataSourceDef = {
  id: string;
  label: string;
  priority: DataSourcePriority;
  env: { key: string; label: string; optional?: boolean }[];
  status: () => DataSourceStatus;
};

function buildStatus(requirements: DataSourceDef["env"]): DataSourceStatus {
  const missing = requirements
    .filter((entry) => !entry.optional)
    .filter((entry) => !(process.env[entry.key] ?? "").trim())
    .map((entry) => entry.key);

  if (missing.length > 0) {
    return {
      state: "missing",
      message: `필수 ENV 누락: ${missing.join(", ")}`,
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    state: "configured",
    updatedAt: new Date().toISOString(),
  };
}

function defineDataSource(def: Omit<DataSourceDef, "status"> & { status?: () => DataSourceStatus }): DataSourceDef {
  return {
    ...def,
    status: def.status ?? (() => buildStatus(def.env)),
  };
}

export const DATA_SOURCES: DataSourceDef[] = [
  defineDataSource({
    id: "FINLIFE",
    label: "금융상품 한눈에",
    priority: "P0",
    env: [{ key: "FINLIFE_API_KEY", label: "FINLIFE API Key" }],
  }),
  defineDataSource({
    id: "DATAGO_KDB",
    label: "data.go.kr KDB 예금상품",
    priority: "P0",
    env: [
      { key: "KDB_DATAGO_SERVICE_KEY", label: "KDB data.go.kr ServiceKey", optional: true },
      { key: "DATAGO_SERVICE_KEY", label: "data.go.kr ServiceKey (fallback)", optional: true },
    ],
    status: () => {
      const kdbKey = (process.env.KDB_DATAGO_SERVICE_KEY ?? "").trim();
      const fallbackKey = (process.env.DATAGO_SERVICE_KEY ?? "").trim();
      return {
        state: kdbKey || fallbackKey ? "configured" : "missing",
        message: kdbKey || fallbackKey ? undefined : "필수 ENV 누락: KDB_DATAGO_SERVICE_KEY (or DATAGO_SERVICE_KEY)",
        updatedAt: new Date().toISOString(),
      };
    },
  }),
  defineDataSource({
    id: "MOLIT_SALES",
    label: "국토부 실거래(매매)",
    priority: "P0",
    env: [
      { key: "MOLIT_SALES_API_KEY", label: "MOLIT SALES API Key" },
      { key: "MOLIT_SALES_API_URL", label: "MOLIT SALES API URL" },
    ],
  }),
  defineDataSource({
    id: "MOLIT_RENT",
    label: "국토부 전월세",
    priority: "P0",
    env: [
      { key: "MOLIT_RENT_API_KEY", label: "MOLIT RENT API Key" },
      { key: "MOLIT_RENT_API_URL", label: "MOLIT RENT API URL" },
    ],
  }),
  defineDataSource({
    id: "MOIS_BENEFITS",
    label: "보조금24",
    priority: "P0",
    env: [
      { key: "MOIS_BENEFITS_API_KEY", label: "MOIS API Key" },
      { key: "MOIS_BENEFITS_API_URL", label: "MOIS API URL" },
    ],
  }),
  defineDataSource({
    id: "REB_SUBSCRIPTION",
    label: "청약홈",
    priority: "P0",
    env: [
      { key: "REB_SUBSCRIPTION_API_KEY", label: "REB API Key" },
      { key: "REB_SUBSCRIPTION_API_URL", label: "REB API URL" },
    ],
  }),
  defineDataSource({
    id: "EXIM_EXCHANGE",
    label: "한국수출입은행 환율",
    priority: "P0",
    env: [
      { key: "EXIM_EXCHANGE_API_KEY", label: "EXIM API Key" },
      { key: "EXIM_EXCHANGE_API_URL", label: "EXIM API URL" },
    ],
  }),
  defineDataSource({
    id: "NPS",
    label: "국민연금 가입현황",
    priority: "P1",
    env: [
      { key: "NPS_PENSION_API_KEY", label: "NPS API Key", optional: true },
      { key: "NPS_PENSION_API_URL", label: "NPS API URL", optional: true },
    ],
  }),
  defineDataSource({
    id: "FSS_INSURANCE",
    label: "실손보험",
    priority: "P1",
    env: [
      { key: "FSS_INSURANCE_API_KEY", label: "FSS INSURANCE API Key", optional: true },
      { key: "FSS_INSURANCE_API_URL", label: "FSS INSURANCE API URL", optional: true },
    ],
  }),
  defineDataSource({
    id: "FSC_RETIRE_PENSION",
    label: "퇴직연금 기본정보",
    priority: "P1",
    env: [
      { key: "FSC_RETIRE_PENSION_API_KEY", label: "FSC RETIRE API Key", optional: true },
      { key: "FSC_RETIRE_PENSION_API_URL", label: "FSC RETIRE API URL", optional: true },
    ],
  }),
  defineDataSource({
    id: "KDB_RETIRE_GUARANTEE_RATE",
    label: "KDB 원리금보장 금리",
    priority: "P1",
    env: [
      { key: "KDB_RETIRE_GUARANTEE_API_KEY", label: "KDB RETIRE API Key", optional: true },
      { key: "KDB_RETIRE_GUARANTEE_API_URL", label: "KDB RETIRE API URL", optional: true },
    ],
  }),
  defineDataSource({
    id: "FSC_FIN_COMPANY_INFO",
    label: "금융회사 기본정보",
    priority: "P1",
    env: [
      { key: "FSC_FINCOMPANY_API_KEY", label: "FSC FINCOMPANY API Key", optional: true },
      { key: "FSC_FINCOMPANY_API_URL", label: "FSC FINCOMPANY API URL", optional: true },
    ],
  }),
  defineDataSource({
    id: "BOK_ECOS",
    label: "한국은행 ECOS",
    priority: "P1",
    env: [
      { key: "BOK_ECOS_API_KEY", label: "BOK ECOS API Key", optional: true },
      { key: "BOK_ECOS_API_URL", label: "BOK ECOS API URL", optional: true },
    ],
  }),
];

export function getDataSourceStatuses() {
  return DATA_SOURCES.map((ds) => ({
    id: ds.id,
    label: ds.label,
    priority: ds.priority,
    env: ds.env.map((entry) => ({ ...entry })),
    status: ds.status(),
  }));
}
