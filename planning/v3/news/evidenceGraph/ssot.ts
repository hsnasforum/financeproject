import { normalizeSeriesId } from "../../indicators/aliases";
import { normalizeEntityIds } from "../entities/extract";
import { NewsEventTypeSchema, type NewsEventType } from "../events/contracts";
import { canonicalizeTopicId } from "../taxonomy";

type EvidenceGraph = {
  byTopic: Record<string, readonly string[]>;
  byEntity: Record<string, readonly string[]>;
  byEventType: Record<NewsEventType, readonly string[]>;
};

export const EVIDENCE_GRAPH_SSOT: EvidenceGraph = {
  byTopic: {
    rates: ["kr_base_rate", "kr_gov_bond_3y"],
    inflation: ["kr_cpi", "kr_core_cpi"],
    fx: ["kr_usdkrw", "kr_cab"],
    growth: ["kr_ip", "kr_exports"],
    labor: ["kr_employment_rate"],
    credit: ["kr_cb_spread_aa"],
    commodities: ["brent_oil", "wti_oil"],
    fiscal: ["kr_treasury_outstanding", "kr_fiscal_balance"],
    general: ["kr_base_rate", "kr_usdkrw"],
  },
  byEntity: {
    central_bank_fed: ["kr_base_rate", "kr_usdkrw"],
    central_bank_bok: ["kr_base_rate"],
    currency_usdkrw: ["kr_usdkrw"],
    index_dxy: ["kr_usdkrw"],
    commodity_wti: ["wti_oil"],
    commodity_brent: ["brent_oil"],
    cartel_opec_plus: ["brent_oil", "wti_oil"],
    agency_moef: ["kr_fiscal_balance", "kr_treasury_outstanding"],
    agency_kosis: ["kr_cpi", "kr_employment_rate", "kr_ip"],
  },
  byEventType: {
    policy_rate_signal: ["kr_base_rate", "kr_gov_bond_3y"],
    inflation_release: ["kr_cpi", "kr_core_cpi"],
    fx_volatility: ["kr_usdkrw", "kr_cab"],
    commodity_supply_shock: ["brent_oil", "wti_oil"],
    fiscal_policy_update: ["kr_fiscal_balance", "kr_treasury_outstanding"],
    credit_stress: ["kr_cb_spread_aa"],
    growth_slowdown: ["kr_ip", "kr_exports"],
    labor_market_shift: ["kr_employment_rate"],
    geopolitical_risk: ["kr_usdkrw", "brent_oil"],
  },
};

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeSeriesId(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeTopics(values: string[] | undefined): string[] {
  if (!values || values.length === 0) return [];
  const out = values
    .map((value) => canonicalizeTopicId(value))
    .filter((value) => value.length > 0);
  return dedupe(out);
}

function normalizeEventTypes(values: string[] | undefined): NewsEventType[] {
  if (!values || values.length === 0) return [];
  const out: NewsEventType[] = [];
  for (const value of values) {
    const parsed = NewsEventTypeSchema.safeParse(value);
    if (!parsed.success) continue;
    out.push(parsed.data);
  }
  return [...new Set(out)];
}

export function resolveEvidenceSeriesIds(input: {
  topics?: string[];
  entities?: string[];
  eventTypes?: string[];
  maxSeriesIds?: number;
}): string[] {
  const maxSeriesIds = Math.max(1, Math.min(24, Math.round(input.maxSeriesIds ?? 8)));
  const topics = normalizeTopics(input.topics);
  const entities = normalizeEntityIds(input.entities);
  const eventTypes = normalizeEventTypes(input.eventTypes);

  const out: string[] = [];
  const push = (seriesIds: readonly string[] | undefined) => {
    if (!seriesIds || seriesIds.length === 0) return;
    for (const seriesId of seriesIds) {
      out.push(seriesId);
    }
  };

  for (const topicId of topics) {
    push(EVIDENCE_GRAPH_SSOT.byTopic[topicId]);
  }
  for (const entityId of entities) {
    push(EVIDENCE_GRAPH_SSOT.byEntity[entityId]);
  }
  for (const eventType of eventTypes) {
    push(EVIDENCE_GRAPH_SSOT.byEventType[eventType]);
  }

  const normalized = dedupe(out);
  if (normalized.length > 0) {
    return normalized.slice(0, maxSeriesIds);
  }

  return dedupe([...(EVIDENCE_GRAPH_SSOT.byTopic.general ?? [])]).slice(0, maxSeriesIds);
}
