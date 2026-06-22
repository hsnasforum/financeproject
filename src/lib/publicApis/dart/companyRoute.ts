import fs from "node:fs";
import path from "node:path";
import { type DartCompany } from "@/lib/publicApis/dart/types";

export type DartCompanyRouteData = {
  corpCode: string;
  corpName: string;
  stockCode?: string;
  industry?: string;
  ceo?: string;
  homepage?: string;
  address?: string;
  source: string;
  fetchedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function normalizeCorpCode(value: string | null): string {
  return (value ?? "").trim();
}

export function isValidCorpCode(value: string): boolean {
  return /^\d{8}$/.test(value);
}

function fixturePath(): string {
  return path.join(process.cwd(), "tests", "fixtures", "dart", "company.sample.json");
}

export function loadFixtureDartCompanyRouteData(now = new Date()): DartCompanyRouteData {
  const parsed = JSON.parse(fs.readFileSync(fixturePath(), "utf-8")) as unknown;
  const data = isRecord(parsed) && isRecord(parsed.data) ? parsed.data : parsed;
  if (!isRecord(data)) {
    throw new Error("invalid fixture payload");
  }

  return {
    corpCode: asString(data.corp_code) ?? asString(data.corpCode) ?? "",
    corpName: asString(data.corp_name) ?? asString(data.corpName) ?? "",
    stockCode: asString(data.stock_code) ?? asString(data.stockCode),
    industry: asString(data.induty_code) ?? asString(data.industry),
    ceo: asString(data.ceo_nm) ?? asString(data.ceo),
    homepage: asString(data.hm_url) ?? asString(data.homepage),
    address: asString(data.adres) ?? asString(data.address),
    source: "OpenDART E2E Fixture",
    fetchedAt: now.toISOString(),
  };
}

export function toDartCompanyRouteData(company: DartCompany, now = new Date()): DartCompanyRouteData {
  return {
    corpCode: company.corp_code,
    corpName: company.corp_name,
    stockCode: company.stock_code,
    industry: company.induty_code,
    ceo: company.ceo_nm,
    homepage: company.hm_url,
    address: company.adres,
    source: "금융감독원 전자공시(OpenDART)",
    fetchedAt: now.toISOString(),
  };
}
