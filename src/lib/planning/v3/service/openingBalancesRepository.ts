import {
  getOpeningBalances as getStoredOpeningBalances,
  upsertOpeningBalance as upsertStoredOpeningBalance,
} from "../store/openingBalancesStore";

export async function getCurrentUserOpeningBalances() {
  return getStoredOpeningBalances();
}

export async function upsertCurrentUserOpeningBalance(
  accountId: string,
  asOfDate: string,
  amountKrw: number,
) {
  return upsertStoredOpeningBalance(accountId, asOfDate, amountKrw);
}
