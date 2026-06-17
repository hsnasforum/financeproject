import {
  AccountsStoreInputError,
  deleteAccount as deleteStoredAccount,
  getAccount as getStoredAccount,
  listAccounts as listStoredAccounts,
  setAccountStartingBalance as setStoredAccountStartingBalance,
  updateAccount as updateStoredAccount,
  upsertAccount as upsertStoredAccount,
} from "../store/accountsStore";

export { AccountsStoreInputError };

export type AccountCreateCommand = Parameters<typeof upsertStoredAccount>[0];
export type AccountUpdateCommand = Parameters<typeof updateStoredAccount>[1];

export async function listCurrentUserAccounts() {
  return listStoredAccounts();
}

export async function getCurrentUserAccount(id: string) {
  return getStoredAccount(id);
}

export async function upsertCurrentUserAccount(input: AccountCreateCommand) {
  return upsertStoredAccount(input);
}

export async function updateCurrentUserAccount(id: string, input: AccountUpdateCommand) {
  return updateStoredAccount(id, input);
}

export async function deleteCurrentUserAccount(id: string) {
  return deleteStoredAccount(id);
}

export async function setCurrentUserAccountStartingBalance(id: string, startingBalanceKrw: unknown) {
  return setStoredAccountStartingBalance(id, startingBalanceKrw);
}
