import {
  CategoryRulesStoreInputError,
  deleteRule as deleteStoredRule,
  listRules as listStoredRules,
  upsertRule as upsertStoredRule,
} from "../store/categoryRulesStore";

export { CategoryRulesStoreInputError };

export type CategoryRuleUpsertCommand = Parameters<typeof upsertStoredRule>[0];

export async function listCurrentUserCategoryRules() {
  return listStoredRules();
}

export async function upsertCurrentUserCategoryRule(input: CategoryRuleUpsertCommand) {
  return upsertStoredRule(input);
}

export async function deleteCurrentUserCategoryRule(id: string) {
  return deleteStoredRule(id);
}
