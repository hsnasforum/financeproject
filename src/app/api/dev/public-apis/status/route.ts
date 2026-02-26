import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getApiCacheDiagnostics } from "@/lib/cache/apiCache";
import { onlyDev } from "@/lib/dev/onlyDev";
import { computeMissingKeys, computeNotLoadedYet, parseEnvKeys, parseEnvTemplate, validateApiUrls } from "@/lib/dev/envDoctor";

export const runtime = "nodejs";

const ENV_KEYS = [
  "KEXIM_API_KEY",
  "MOLIT_SALES_API_KEY",
  "MOLIT_SALES_API_URL",
  "MOLIT_RENT_API_KEY",
  "MOLIT_RENT_API_URL",
  "MOIS_BENEFITS_API_KEY",
  "MOIS_BENEFITS_API_URL",
  "REB_SUBSCRIPTION_API_KEY",
  "REB_SUBSCRIPTION_API_URL",
  "OPENDART_API_KEY",
] as const;

const APIS = [
  { apiName: "kexim-fx", label: "환율(KEXIM)", required: ["KEXIM_API_KEY"] },
  { apiName: "molit-sales", label: "국토부 매매", required: ["MOLIT_SALES_API_KEY", "MOLIT_SALES_API_URL"] },
  { apiName: "molit-rent", label: "국토부 전월세", required: ["MOLIT_RENT_API_KEY", "MOLIT_RENT_API_URL"] },
  { apiName: "mois-benefits", label: "보조금24", required: ["MOIS_BENEFITS_API_KEY", "MOIS_BENEFITS_API_URL"] },
  { apiName: "reb-subscription", label: "청약홈", required: ["REB_SUBSCRIPTION_API_KEY", "REB_SUBSCRIPTION_API_URL"] },
  { apiName: "opendart-company", label: "OpenDART 기업개황", required: ["OPENDART_API_KEY"] },
] as const;

export async function GET() {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const root = process.cwd();
  const examplePath = path.join(root, ".env.local.example");
  const envLocalPath = path.join(root, ".env.local");
  const exampleExists = fs.existsSync(examplePath);
  const envLocalExists = fs.existsSync(envLocalPath);
  const template = exampleExists ? parseEnvTemplate(fs.readFileSync(examplePath, "utf-8")) : { requiredKeys: [...ENV_KEYS], optionalKeys: [], allKeys: [...ENV_KEYS] };
  const envLocalKeys = envLocalExists ? parseEnvKeys(fs.readFileSync(envLocalPath, "utf-8")) : [];
  const scopedEnvLocalKeys = envLocalKeys.filter((key) => template.allKeys.includes(key));
  const loadedEnvKeys = template.allKeys.filter((key) => Boolean(process.env[key]));
  const missingKeysInEnvLocal = computeMissingKeys(template.requiredKeys, scopedEnvLocalKeys);
  const presentKeysInEnvLocal = template.requiredKeys.filter((key) => scopedEnvLocalKeys.includes(key));
  const keysNotLoadedYet = computeNotLoadedYet(scopedEnvLocalKeys, loadedEnvKeys);
  const restartNeeded = keysNotLoadedYet.length > 0;

  const env = Object.fromEntries(ENV_KEYS.map((key) => [key, Boolean(process.env[key])]));
  const envValues = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const apis = APIS.map((api) => {
    const missing = api.required.filter((key) => !process.env[key]);
    return {
      ...api,
      ready: missing.length === 0,
      missing,
    };
  });
  const urlValidation = validateApiUrls(APIS.map((api) => ({ apiName: api.apiName, required: [...api.required] })), envValues);

  return NextResponse.json({
    ok: true,
    env,
    apis,
    envFile: {
      envLocalExists,
      presentKeysInEnvLocal,
      missingKeysInEnvLocal,
    },
    restartHint: {
      needed: restartNeeded,
      reason: restartNeeded ? "`.env.local`에는 있으나 서버 프로세스에 아직 로드되지 않은 키가 있습니다." : undefined,
      keysNotLoadedYet: restartNeeded ? keysNotLoadedYet : [],
    },
    urlValidation,
    cache: getApiCacheDiagnostics(),
    fetchedAt: new Date().toISOString(),
  });
}
