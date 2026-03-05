import { type NewsItem } from "../contracts";

export const FIXTURE_NOW_ISO = "2026-03-04T12:00:00.000Z";

export const FIXTURE_ITEMS: NewsItem[] = [
  {
    id: "i-rates-1",
    sourceId: "bok_mpc_decisions",
    title: "Fed signals possible rate cut this summer",
    url: "https://example.com/news/rates-1",
    publishedAt: "2026-03-04T09:00:00.000Z",
    snippet: "Federal Reserve officials hinted at a slower tightening path and possible rate cut.",
    fetchedAt: FIXTURE_NOW_ISO,
  },
  {
    id: "i-rates-2",
    sourceId: "bok_press_all",
    title: "Fed signals possible rate cut this summer, says officials",
    url: "https://example.com/news/rates-2",
    publishedAt: "2026-03-04T08:30:00.000Z",
    snippet: "Rate outlook changed after labor data cooled.",
    fetchedAt: FIXTURE_NOW_ISO,
  },
  {
    id: "i-fx-1",
    sourceId: "kosis_monthly_trend",
    title: "USDKRW climbs as treasury yields rise",
    url: "https://example.com/news/fx-1",
    publishedAt: "2026-03-04T07:00:00.000Z",
    snippet: "Dollar strength returned with higher bond yields.",
    fetchedAt: FIXTURE_NOW_ISO,
  },
  {
    id: "i-policy-1",
    sourceId: "moef_econ_policy_en",
    title: "Tariff policy review expands to auto imports",
    url: "https://example.com/news/policy-1",
    publishedAt: "2026-03-03T12:30:00.000Z",
    snippet: "Government officials discussed additional tariff options.",
    fetchedAt: FIXTURE_NOW_ISO,
  },
  {
    id: "i-old-1",
    sourceId: "fed_press_all",
    title: "Old market recap",
    url: "https://example.com/news/old-1",
    publishedAt: "2026-02-28T12:00:00.000Z",
    snippet: "Outside 72h window should be excluded.",
    fetchedAt: FIXTURE_NOW_ISO,
  },
];
