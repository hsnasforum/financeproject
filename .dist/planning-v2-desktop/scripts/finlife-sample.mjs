import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvLocal(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const raw = readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function maskKey(value) {
  if (!value) return '****';
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

function keyList(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return [];
  }
  return Object.keys(obj).sort();
}

async function inspectEndpoint(baseUrl, auth, endpoint, topFinGrpNo = '020000', pageNo = '1') {
  const url = new URL(`${baseUrl}/${endpoint}`);
  url.searchParams.set('auth', auth);
  url.searchParams.set('topFinGrpNo', topFinGrpNo);
  url.searchParams.set('pageNo', pageNo);

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    console.log(`\\n[${endpoint}] non-json response status=${res.status}`);
    console.log(text.slice(0, 300));
    return;
  }

  const result = json?.result ?? {};
  const baseList = Array.isArray(result?.baseList) ? result.baseList : [];
  const optionList = Array.isArray(result?.optionList) ? result.optionList : [];

  console.log(`\\n[${endpoint}] status=${res.status}`);
  console.log('top-level keys:', keyList(json));
  console.log('result keys:', keyList(result));
  console.log('baseList length:', baseList.length);
  console.log('optionList length:', optionList.length);
  console.log('baseList[0] keys:', keyList(baseList[0]));
  console.log('optionList[0] keys:', keyList(optionList[0]));
}

async function main() {
  const envPath = resolve(process.cwd(), '.env.local');
  loadEnvLocal(envPath);

  const auth = process.env.FINLIFE_API_KEY;
  const baseUrl = process.env.FINLIFE_BASE_URL || 'https://finlife.fss.or.kr/finlifeapi';

  if (!auth) {
    console.log('키 설정 필요: .env.local의 FINLIFE_API_KEY를 채운 뒤 다시 실행하세요.');
    return;
  }

  console.log('FINLIFE_API_KEY:', maskKey(auth));
  console.log('FINLIFE_BASE_URL:', baseUrl);

  try {
    await inspectEndpoint(baseUrl, auth, 'depositProductsSearch.json');
    await inspectEndpoint(baseUrl, auth, 'savingProductsSearch.json');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log('호출 실패:', message);
  }
}

main();
