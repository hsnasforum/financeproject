import { z } from "zod";

export const NewsEventTypeSchema = z.enum([
  "policy_rate_signal",
  "inflation_release",
  "fx_volatility",
  "commodity_supply_shock",
  "fiscal_policy_update",
  "credit_stress",
  "growth_slowdown",
  "labor_market_shift",
  "geopolitical_risk",
]);

export type NewsEventType = z.infer<typeof NewsEventTypeSchema>;

export const NewsEventRuleSchema = z.object({
  id: NewsEventTypeSchema,
  keywordsAny: z.array(z.string().trim().min(1)).min(1),
  entitiesAny: z.array(z.string().trim().regex(/^[a-z0-9_]+$/)).default([]),
});

export type NewsEventRule = z.infer<typeof NewsEventRuleSchema>;
