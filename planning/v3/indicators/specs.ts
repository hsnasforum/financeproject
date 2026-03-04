import {
  IndicatorSourceSchema,
  SeriesSpecSchema,
  type IndicatorSource,
  type SeriesSpec,
} from "./contracts";

const RAW_SOURCES: IndicatorSource[] = [
  {
    id: "fixture",
    name: "Local Fixture Indicators",
    type: "fixture",
    enabled: true,
  },
];

const RAW_SERIES_SPECS: SeriesSpec[] = [
  {
    id: "kr_base_rate",
    sourceId: "fixture",
    externalId: "fixture://kr_base_rate",
    name: "Korea Base Rate",
    frequency: "M",
    units: "%",
    transform: "none",
    notes: "Fixture monthly policy rate series",
    enabled: true,
  },
  {
    id: "kr_usdkrw",
    sourceId: "fixture",
    externalId: "fixture://kr_usdkrw",
    name: "USDKRW Spot",
    frequency: "D",
    units: "KRW",
    transform: "none",
    notes: "Fixture daily KRW exchange series",
    enabled: true,
  },
  {
    id: "kr_cpi",
    sourceId: "fixture",
    externalId: "fixture://kr_cpi",
    name: "Korea CPI Index",
    frequency: "M",
    units: "Index",
    transform: "pct_change",
    notes: "Fixture monthly CPI index series",
    enabled: true,
  },
  {
    id: "brent_oil",
    sourceId: "fixture",
    externalId: "fixture://brent_oil",
    name: "Brent Crude Oil",
    frequency: "D",
    units: "USD/bbl",
    transform: "none",
    notes: "Fixture daily oil benchmark series",
    enabled: true,
  },
];

export const INDICATOR_SOURCES: IndicatorSource[] = RAW_SOURCES.map((row) => IndicatorSourceSchema.parse(row));
export const INDICATOR_SERIES_SPECS: SeriesSpec[] = RAW_SERIES_SPECS.map((row) => SeriesSpecSchema.parse(row));
