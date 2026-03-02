#!/usr/bin/env node
import path from "node:path";
import { parseEnvKeys, parseEnvKeyValues, parseEnvTemplate, readFileIfExists, validateApiUrls } from "./env_utils.mjs";

const root = process.cwd();
const examplePath = path.join(root, ".env.local.example");
const envLocalPath = path.join(root, ".env.local");

const example = readFileIfExists(examplePath);
if (!example) {
  console.error("[env:doctor] .env.local.example is missing");
  process.exit(1);
}

const template = parseEnvTemplate(example);
const envLocal = readFileIfExists(envLocalPath);
if (!envLocal) {
  console.error("[env:doctor] .env.local is missing. run: pnpm env:setup");
  process.exit(1);
}

const envLocalKeys = parseEnvKeys(envLocal);
const missing = template.requiredKeys.filter((key) => !envLocalKeys.includes(key));
const envLocalValues = parseEnvKeyValues(envLocal);
const apiSpecs = [
  { apiName: "kexim-fx", required: ["KEXIM_API_KEY"] },
  { apiName: "molit-sales", required: ["MOLIT_SALES_API_KEY", "MOLIT_SALES_API_URL"] },
  { apiName: "molit-rent", required: ["MOLIT_RENT_API_KEY", "MOLIT_RENT_API_URL"] },
  { apiName: "mois-benefits", required: ["MOIS_BENEFITS_API_KEY", "MOIS_BENEFITS_API_URL"] },
  { apiName: "reb-subscription", required: ["REB_SUBSCRIPTION_API_KEY", "REB_SUBSCRIPTION_API_URL"] },
  { apiName: "opendart-company", required: ["OPENDART_API_KEY"] },
];
const urlValidation = validateApiUrls(apiSpecs, envLocalValues);
const urlErrors = [];

console.log(`[env:doctor] required keys: ${template.requiredKeys.length}`);
console.log(`[env:doctor] present: ${template.requiredKeys.length - missing.length}`);
if (missing.length > 0) {
  console.error(`[env:doctor] missing (${missing.length})`);
  for (const key of missing) {
    console.error(`- ${key}`);
  }
  process.exit(1);
}

for (const row of urlValidation) {
  if (row.warnings.length > 0) {
    console.warn(`[env:doctor][${row.apiName}]`);
    for (const warning of row.warnings) {
      console.warn(`- ${warning}`);
      if (warning.includes("must start with http:// or https://") || warning.endsWith("missing")) {
        urlErrors.push(`${row.apiName}:${warning}`);
      }
    }
  }
}

if (urlErrors.length > 0) {
  process.exit(1);
}

console.log("[env:doctor] ok");
