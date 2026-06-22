import fs from "node:fs";
import { describe, expect, it } from "vitest";

function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function modelNames(schema: string): string[] {
  return [...schema.matchAll(/^model\s+(\w+)\s+\{/gm)].map((match) => match[1]);
}

function modelBlock(schema: string, modelName: string): string {
  const match = new RegExp(`model\\s+${modelName}\\s+\\{([\\s\\S]*?)\\n\\}`, "u").exec(schema);
  if (!match?.[1]) throw new Error(`Model not found: ${modelName}`);
  return match[1];
}

function expectModelFields(schema: string, modelName: string, fields: string[]): void {
  const block = modelBlock(schema, modelName);
  for (const field of fields) {
    expect(block).toContain(field);
  }
}

describe("PostgreSQL planning target schema contract", () => {
  it("keeps the active SQLite runtime schema separate from the PostgreSQL target schema", () => {
    const sqliteSchema = read("prisma/schema.prisma");
    const postgresSchema = read("prisma/schema.postgres.prisma");

    expect(sqliteSchema).toContain('provider = "sqlite"');
    expect(postgresSchema).toContain('provider = "postgresql"');
    expect(postgresSchema).toContain('output   = "../node_modules/.prisma/client-postgres"');
    expect(modelNames(sqliteSchema)).toHaveLength(14);
    expect(modelNames(postgresSchema)).toHaveLength(28);
  });

  it("keeps required PostgreSQL ownership and planning domain models present", () => {
    const schema = read("prisma/schema.postgres.prisma");

    expect(modelNames(schema)).toEqual([
      "User",
      "Account",
      "Session",
      "VerificationToken",
      "Provider",
      "Product",
      "ProductOption",
      "UserProfile",
      "Favorite",
      "PlannerSnapshot",
      "PlanningProfile",
      "PlanningRun",
      "PlanningRunBlob",
      "ActionPlan",
      "ActionProgress",
      "FinancialAccount",
      "Debt",
      "FinancialGoal",
      "RecurringCashflow",
      "PlanningAssumptionSnapshot",
      "TransactionBatch",
      "Transaction",
      "TransactionOverride",
      "OpeningBalance",
      "ProviderAlias",
      "ExternalSourceSnapshot",
      "ExternalProduct",
      "ExternalProductMatch",
    ]);
  });

  it("keeps Auth.js Account separate from finance FinancialAccount", () => {
    const schema = read("prisma/schema.postgres.prisma");
    const authAccount = modelBlock(schema, "Account");
    const financialAccount = modelBlock(schema, "FinancialAccount");

    expect(authAccount).toContain("@@unique([provider, providerAccountId])");
    expect(authAccount).toContain("refresh_token");
    expect(authAccount).not.toContain("balanceKrw");
    expect(authAccount).not.toContain("accountType");

    expect(financialAccount).toContain("accountType");
    expect(financialAccount).toContain("balanceKrw        BigInt?");
    expect(financialAccount).not.toContain("providerAccountId");
    expect(modelBlock(schema, "User")).toContain("accounts             Account[]");
    expect(modelBlock(schema, "User")).toContain("financialAccounts    FinancialAccount[]");
  });

  it("keeps money as BigInt and rates/ratios as Decimal in the PostgreSQL target", () => {
    const schema = read("prisma/schema.postgres.prisma");

    expectModelFields(schema, "PlannerSnapshot", [
      "monthlyIncome   BigInt?",
      "monthlyExpense  BigInt?",
      "monthlySaving   BigInt?",
      "goalAmount      BigInt?",
      "emergencyMonths Decimal?    @db.Decimal(10, 4)",
      "debtBurdenRatio Decimal?    @db.Decimal(10, 6)",
    ]);
    expectModelFields(schema, "ProductOption", [
      "intrRate  Decimal? @db.Decimal(10, 6)",
      "intrRate2 Decimal? @db.Decimal(10, 6)",
    ]);
    expectModelFields(schema, "Debt", [
      "principalKrw      BigInt",
      "monthlyPaymentKrw BigInt?",
      "annualRate        Decimal?         @db.Decimal(10, 6)",
    ]);
    expectModelFields(schema, "FinancialGoal", ["targetAmountKrw   BigInt"]);
    expectModelFields(schema, "RecurringCashflow", ["amountKrw         BigInt"]);
    expectModelFields(schema, "Transaction", ["amountKrw          BigInt"]);
    expectModelFields(schema, "OpeningBalance", ["amountKrw          BigInt"]);
    expectModelFields(schema, "ExternalProductMatch", ["confidence        Decimal         @db.Decimal(10, 6)"]);
  });
});
