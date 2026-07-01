import { NewsEventRuleSchema, NewsEventTypeSchema, type NewsEventRule, type NewsEventType } from "./contracts";

type EventClassifierInput = {
  title?: string;
  snippet?: string;
  entities?: string[];
};

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+/#\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAsciiToken(value: string): boolean {
  return /^[a-z0-9+/# ]+$/.test(value);
}

function includesToken(text: string, token: string): boolean {
  const normalized = normalizeText(token);
  if (!normalized) return false;
  if (isAsciiToken(normalized)) {
    const paddedText = ` ${text} `;
    const paddedToken = ` ${normalized} `;
    return paddedText.includes(paddedToken);
  }
  return text.includes(normalized);
}

function dedupe<T extends string>(values: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const value of values) {
    const token = value.trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(value);
  }
  return out;
}

const RAW_EVENT_RULES: NewsEventRule[] = [
  {
    id: "policy_rate_signal",
    keywordsAny: ["기준금리", "금통위", "fomc", "rate hike", "rate cut", "통화정책", "긴축", "완화"],
    entitiesAny: ["central_bank_fed", "central_bank_bok"],
  },
  {
    id: "inflation_release",
    keywordsAny: ["cpi", "ppi", "소비자물가", "근원물가", "inflation", "물가"],
    entitiesAny: [],
  },
  {
    id: "fx_volatility",
    keywordsAny: ["환율", "외환", "usdkrw", "usd/krw", "달러원", "dxy", "fx"],
    entitiesAny: ["currency_usdkrw", "index_dxy"],
  },
  {
    id: "commodity_supply_shock",
    keywordsAny: ["유가", "원유", "wti", "brent", "opec", "공급망", "원자재"],
    entitiesAny: ["commodity_wti", "commodity_brent", "cartel_opec_plus"],
  },
  {
    id: "fiscal_policy_update",
    keywordsAny: ["재정", "예산", "세제", "세금", "관세", "국채", "moef", "기획재정부"],
    entitiesAny: ["agency_moef"],
  },
  {
    id: "credit_stress",
    keywordsAny: ["신용", "스프레드", "연체", "부도", "자금경색", "뱅크런", "bank run"],
    entitiesAny: [],
  },
  {
    id: "growth_slowdown",
    keywordsAny: ["침체", "둔화", "성장률", "pmi", "산업생산", "수출 감소"],
    entitiesAny: [],
  },
  {
    id: "labor_market_shift",
    keywordsAny: ["고용", "실업", "취업자", "임금", "노동시장"],
    entitiesAny: [],
  },
  {
    id: "geopolitical_risk",
    keywordsAny: ["전쟁", "분쟁", "제재", "지정학", "geopolitical"],
    entitiesAny: [],
  },
];

export const NEWS_EVENT_RULES: NewsEventRule[] = RAW_EVENT_RULES.map((row) => NewsEventRuleSchema.parse(row));

export function normalizeEventTypes(eventTypes: string[] | undefined): NewsEventType[] {
  if (!eventTypes || eventTypes.length === 0) return [];
  const normalized: NewsEventType[] = [];
  for (const value of eventTypes) {
    const parsed = NewsEventTypeSchema.safeParse(value);
    if (!parsed.success) continue;
    normalized.push(parsed.data);
  }
  return dedupe(normalized);
}

function matchesRule(rule: NewsEventRule, text: string, entities: string[]): boolean {
  const keywordMatched = rule.keywordsAny.some((keyword) => includesToken(text, keyword));
  if (!keywordMatched) return false;
  if (!rule.entitiesAny || rule.entitiesAny.length === 0) return true;
  return rule.entitiesAny.some((entityId) => entities.includes(entityId));
}

export function classifyEventTypes(input: EventClassifierInput): NewsEventType[] {
  const text = normalizeText(`${input.title ?? ""} ${input.snippet ?? ""}`);
  if (!text) return [];
  const entities = dedupe((input.entities ?? []).map((value) => value.trim()).filter((value) => value.length > 0));

  const out: NewsEventType[] = [];
  for (const rule of NEWS_EVENT_RULES) {
    if (!matchesRule(rule, text, entities)) continue;
    out.push(rule.id);
  }

  return out;
}
