import { ScenarioTemplateSchema, type ScenarioTemplate } from "./contracts";

const RAW_SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    name: "Base",
    triggers: [
      {
        id: "base-cpi-up",
        label: "물가 압력 관찰",
        seriesId: "KR_CPI",
        metric: "pctChange",
        window: 6,
        condition: "up",
      },
      {
        id: "base-core-up",
        label: "근원물가 관찰",
        seriesId: "KR_CORE_CPI",
        metric: "pctChange",
        window: 6,
        condition: "up",
      },
    ],
  },
  {
    name: "Bull",
    triggers: [
      {
        id: "bull-core-down",
        label: "근원물가 둔화",
        seriesId: "KR_CORE_CPI",
        metric: "regime",
        window: 6,
        condition: "down",
      },
      {
        id: "bull-fx-stable",
        label: "환율 안정",
        seriesId: "KR_USDKRW",
        metric: "regime",
        window: 6,
        condition: "flat",
      },
    ],
  },
  {
    name: "Bear",
    triggers: [
      {
        id: "bear-cpi-high",
        label: "물가 상방 이탈",
        seriesId: "KR_CPI",
        metric: "zscore",
        window: 12,
        condition: "high",
      },
      {
        id: "bear-fx-up",
        label: "환율 상방 압력",
        seriesId: "KR_USDKRW",
        metric: "pctChange",
        window: 3,
        condition: "up",
      },
    ],
  },
];

export const SCENARIO_TEMPLATES: ScenarioTemplate[] = RAW_SCENARIO_TEMPLATES.map((row) => ScenarioTemplateSchema.parse(row));
