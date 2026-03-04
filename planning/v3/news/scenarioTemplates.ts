import { ScenarioTemplateSchema, type ScenarioTemplate } from "./contracts";

const RAW_SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    name: "Base",
    triggers: [
      {
        id: "base-rates-stable",
        label: "정책금리 변화율 안정",
        seriesId: "kr_base_rate",
        view: "pctChange",
        window: 3,
        op: "lte",
        threshold: 1,
      },
      {
        id: "base-fx-flat",
        label: "환율 추세 횡보",
        seriesId: "kr_usdkrw",
        view: "regime",
        window: 5,
        op: "eq",
        regimeValue: "flat",
      },
    ],
  },
  {
    name: "Bull",
    triggers: [
      {
        id: "bull-cpi-cool",
        label: "물가 압력 완만",
        seriesId: "kr_cpi",
        view: "zscore",
        window: 6,
        op: "lte",
        threshold: 1,
      },
      {
        id: "bull-fx-soft",
        label: "환율 하향 또는 안정",
        seriesId: "kr_usdkrw",
        view: "pctChange",
        window: 3,
        op: "lte",
        threshold: 0,
      },
    ],
  },
  {
    name: "Bear",
    triggers: [
      {
        id: "bear-fx-rise",
        label: "환율 상방 압력",
        seriesId: "kr_usdkrw",
        view: "pctChange",
        window: 3,
        op: "gte",
        threshold: 0.5,
      },
      {
        id: "bear-oil-shock",
        label: "원자재 변동성 확대",
        seriesId: "brent_oil",
        view: "zscore",
        window: 4,
        op: "gte",
        threshold: 0.8,
      },
    ],
  },
];

export const SCENARIO_TEMPLATES: ScenarioTemplate[] = RAW_SCENARIO_TEMPLATES.map((row) => ScenarioTemplateSchema.parse(row));
