import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { type Account, AccountsClient } from "../src/app/planning/v3/accounts/_components/AccountsClient";

const SYNTHETIC_ACCOUNT: Account = {
  id: "acc_synthetic",
  name: "합성 입출금",
  kind: "bank",
  currency: "KRW",
};

const HEADER_LINKS = [
  { href: "/planning/v3/transactions/batches", label: "배치 목록" },
  { href: "/planning/v3/import/csv", label: "CSV Import" },
  { href: "/planning/v3/balances", label: "Balance Timeline" },
];

function headerLinkTag(html: string, href: string, label: string): string {
  const tag = html.match(new RegExp(`<a [^>]*href="${href}"[^>]*>${label}</a>`))?.[0];
  if (!tag) throw new Error(`header link not rendered: ${label}`);
  return tag;
}

describe("planning v3 accounts header links", () => {
  it.each([
    { state: "no accounts", initialAccounts: [] as Account[] },
    { state: "a synthetic account", initialAccounts: [SYNTHETIC_ACCOUNT] },
  ])("keeps the links readable on the white card with $state", ({ initialAccounts }) => {
    const html = renderToStaticMarkup(<AccountsClient disableAutoLoad initialAccounts={initialAccounts} />);

    for (const { href, label } of HEADER_LINKS) {
      const tag = headerLinkTag(html, href, label);
      expect(tag).toContain("text-navy");
      expect(tag).not.toMatch(/text-white|bg-white\/|border-white\//);
    }
    if (initialAccounts.length > 0) expect(html).toContain(SYNTHETIC_ACCOUNT.name);
  });
});
