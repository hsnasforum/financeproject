import {
  AccountsClient,
  type Account,
  type OpeningBalance,
} from "./_components/AccountsClient";
import {
  toPlanningPageLoadMessage,
  withCurrentPlanningPageUser,
} from "@/lib/planning/server/pageAuth";
import { listCurrentUserAccounts } from "@/lib/planning/v3/service/accountsRepository";
import { getCurrentUserOpeningBalances } from "@/lib/planning/v3/service/openingBalancesRepository";

export const dynamic = "force-dynamic";

export default async function PlanningV3AccountsPage() {
  let initialAccounts: Account[] = [];
  let initialOpeningBalances: Record<string, OpeningBalance> = {};
  let initialMessage = "";

  try {
    const { accounts, openingBalances } = await withCurrentPlanningPageUser(async () => {
      const [loadedAccounts, loadedOpeningBalances] = await Promise.all([
        listCurrentUserAccounts(),
        getCurrentUserOpeningBalances(),
      ]);
      return {
        accounts: loadedAccounts,
        openingBalances: loadedOpeningBalances,
      };
    });
    initialAccounts = accounts;
    initialOpeningBalances = openingBalances;
  } catch (error) {
    initialAccounts = [];
    initialOpeningBalances = {};
    initialMessage = toPlanningPageLoadMessage(error, "계좌 초기 데이터를 불러오지 못했습니다.");
  }

  return (
    <AccountsClient
      disableAutoLoad
      initialAccounts={initialAccounts}
      initialMessage={initialMessage}
      initialOpeningBalances={initialOpeningBalances}
    />
  );
}
