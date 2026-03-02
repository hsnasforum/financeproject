import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvLocal(filePath) {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function keyList(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  return Object.keys(obj).sort();
}

function mask(value) {
  if (!value) return '****';
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

async function inspect(endpoint) {
  const baseUrl = process.env.FINLIFE_BASE_URL || 'https://finlife.fss.or.kr/finlifeapi';
  const auth = process.env.FINLIFE_API_KEY;
  const url = new URL(`${baseUrl}/${endpoint}`);
  url.searchParams.set('auth', auth);
  url.searchParams.set('topFinGrpNo', '020000');
  url.searchParams.set('pageNo', '1');

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const json = await res.json();
  const result = json?.result ?? {};
  const baseList = Array.isArray(result.baseList) ? result.baseList : [];
  const optionList = Array.isArray(result.optionList) ? result.optionList : [];

  console.log(`\n[${endpoint}] status=${res.status}`);
  console.log('top-level keys:', keyList(json));
  console.log('result keys:', keyList(result));
  console.log('baseList[0] keys:', keyList(baseList[0]));
  console.log('optionList[0] keys:', keyList(optionList[0]));
}

async function main() {
  loadEnvLocal(resolve(process.cwd(), '.env.local'));

  if (!process.env.FINLIFE_API_KEY) {
    console.log('키 설정 필요: .env.local FINLIFE_API_KEY');
    return;
  }

  console.log('FINLIFE_API_KEY:', mask(process.env.FINLIFE_API_KEY));
  await inspect('depositProductsSearch.json');
  await inspect('savingProductsSearch.json');
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.log('inspect 실패:', msg);
});
