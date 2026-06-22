import {
  loadEffectiveAlertRules,
  readAlertRuleOverrides,
  readAlertRulesConfig,
  writeAlertRuleOverrides,
} from "@/lib/planning/v3/news/alerts";

export type CurrentUserAlertRules = {
  defaults: ReturnType<typeof readAlertRulesConfig>;
  overrides: ReturnType<typeof readAlertRuleOverrides>;
  effective: ReturnType<typeof loadEffectiveAlertRules>;
};

export type WriteCurrentUserAlertRuleOverridesInput = Parameters<typeof writeAlertRuleOverrides>[0];

export function readCurrentUserAlertRules(): CurrentUserAlertRules {
  const defaults = readAlertRulesConfig();
  const overrides = readAlertRuleOverrides();
  const effective = loadEffectiveAlertRules();
  return { defaults, overrides, effective };
}

export function writeCurrentUserAlertRuleOverrides(
  input: WriteCurrentUserAlertRuleOverridesInput,
): Pick<CurrentUserAlertRules, "effective"> & { written: ReturnType<typeof writeAlertRuleOverrides> } {
  const written = writeAlertRuleOverrides(input);
  const effective = loadEffectiveAlertRules();
  return { written, effective };
}
