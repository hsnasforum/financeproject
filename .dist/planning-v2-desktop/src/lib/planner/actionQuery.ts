import { normalizeSido } from "../regions/kr";
import type { BenefitTopicKey } from "../publicApis/benefitsTopics";

type SearchParamsLike = {
  get(name: string): string | null;
};

export type BenefitsQueryPreset = {
  q: string;
  category: string;
  region: string;
  ageBand: string;
  incomeBand: string;
  mappedTopics: BenefitTopicKey[];
  sido: string;
  sigungu: string;
};

export type SubscriptionPriority = "general" | "housing-cost" | "family" | "urgent";

export type SubscriptionQueryPreset = {
  region: string;
  type: "apt" | "urbty" | "remndr";
  priority: SubscriptionPriority;
};

const TOPIC_BY_CATEGORY: Record<string, BenefitTopicKey[]> = {
  all: [],
  housing: ["housing", "jeonse", "wolse"],
  jeonse: ["jeonse"],
  wolse: ["wolse"],
  childcare: ["birth"],
  family: ["birth"],
  birth: ["birth"],
  youth: ["youth"],
  job: ["job"],
  education: ["education"],
  medical: ["medical"],
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizeLower(value: string | null | undefined): string {
  return normalizeText(value).toLowerCase();
}

function normalizeRegion(value: string): string {
  const trimmed = normalizeText(value);
  if (!trimmed || trimmed === "all" || trimmed === "전국") return "전국";
  return trimmed;
}

export function mapBenefitCategoryToTopics(category: string): BenefitTopicKey[] {
  const normalized = normalizeLower(category);
  if (!normalized) return [];
  return TOPIC_BY_CATEGORY[normalized] ?? [];
}

export function parseRegionPreset(regionRaw: string): {
  region: string;
  sido: string;
  sigungu: string;
} {
  const region = normalizeRegion(regionRaw);
  if (region === "전국") {
    return { region, sido: "", sigungu: "" };
  }
  const tokens = region.split(/\s+/).filter(Boolean);
  const first = tokens[0] ?? "";
  const sido = normalizeSido(first) ?? normalizeSido(region) ?? "";
  const sigungu = sido ? tokens.slice(1).join(" ").trim() : "";
  return { region, sido, sigungu };
}

function normalizeSubscriptionPriority(value: string): SubscriptionPriority {
  if (value === "housing-cost") return "housing-cost";
  if (value === "family") return "family";
  if (value === "urgent") return "urgent";
  return "general";
}

export function parseBenefitsQueryPreset(searchParams: SearchParamsLike, fallbackQuery = ""): BenefitsQueryPreset {
  const q = normalizeText(searchParams.get("q")) || normalizeText(searchParams.get("query")) || normalizeText(fallbackQuery);
  const category = normalizeLower(searchParams.get("category")) || "all";
  const ageBand = normalizeLower(searchParams.get("ageBand")) || "all";
  const incomeBand = normalizeLower(searchParams.get("incomeBand")) || "all";
  const regionPreset = parseRegionPreset(normalizeText(searchParams.get("region")));

  return {
    q,
    category,
    region: regionPreset.region,
    ageBand,
    incomeBand,
    mappedTopics: mapBenefitCategoryToTopics(category),
    sido: regionPreset.sido,
    sigungu: regionPreset.sigungu,
  };
}

export function parseSubscriptionQueryPreset(searchParams: SearchParamsLike, fallbackRegion = "전국"): SubscriptionQueryPreset {
  const region = normalizeRegion(normalizeText(searchParams.get("region")) || normalizeText(fallbackRegion) || "전국");
  const typeRaw = normalizeLower(searchParams.get("type")) || normalizeLower(searchParams.get("houseType"));
  const type: "apt" | "urbty" | "remndr" =
    typeRaw === "urbty" ? "urbty" : typeRaw === "remndr" ? "remndr" : "apt";

  const priority = normalizeSubscriptionPriority(normalizeLower(searchParams.get("priority")) || "general");
  return { region, type, priority };
}
