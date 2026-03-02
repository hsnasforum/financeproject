/**
 * scripts/providers-logos-import.mjs
 *
 * This script imports financial institution logos from a ZIP file,
 * matches them with 'fin_co_no' using institution names,
 * and saves them to 'public/providers/'.
 */

import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yauzl from 'yauzl';
import iconv from 'iconv-lite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

// --- Configuration / CLI Args ---
const args = process.argv.slice(2).reduce((acc, arg) => {
  if (arg.startsWith('--')) {
    const [k, v] = arg.split('=');
    acc[k.slice(2)] = v ?? true;
  }
  return acc;
}, {});

const CONFIG = {
  zipPath: path.resolve(ROOT_DIR, args.zip ?? '금융회사_로고아이콘.zip'),
  variant: args.variant ?? '컬러',
  format: (args.format ?? 'SVG').toUpperCase(),
  baseUrl: args.baseUrl ?? 'http://localhost:3000',
  pages: parseInt(args.pages ?? '2', 10),
  topFinGrpNo: args.topFinGrpNo ?? '020000',
  type: args.type ?? 'both', // 'deposit', 'saving', 'both'
  overwrite: String(args.overwrite) === 'true',
  dryRun: String(args.dryRun) === 'true',
  debugZip: String(args.debugZip) === 'true',
  debugApi: String(args.debugApi) === 'true',
  failOnEmptyProviders: (args.failOnEmptyProviders ?? 'true') === 'true',
  failOnEmptyIcons: (args.failOnEmptyIcons ?? 'true') === 'true',
};

const OUTPUT_DIR = path.join(ROOT_DIR, 'public', 'providers');
const REPORT_PATH = path.join(ROOT_DIR, 'docs', 'ui', 'providers.logo-map.json');

// --- Aliases for Matching ---
const NAME_TO_SLUG_ALIASES = {
  '국민': 'KB',
  'KB국민': 'KB',
  '우리': '우리',
  '신한': '신한',
  '하나': '하나',
  '농협': '농협',
  '중소기업': 'IBK',
  '기업': 'IBK',
  'IBK기업': 'IBK',
  '산업': 'KDB',
  'KDB산업': 'KDB',
  '한국씨티': '씨티',
  '씨티': '씨티',
  'SC제일': 'SC제일',
  'SC': 'SC제일',
  '스탠다드': 'SC제일',
  '부산': 'BNK',
  '경남': 'BNK',
  '대구': 'DGB',
  '아이엠': 'DGB',
  'IM': 'DGB',
  '광주': '광주',
  '전북': '전북',
  '제주': '제주',
  '수협': 'Sh수협',
  '카카오뱅크': '카카오뱅크',
  '케이뱅크': '케이뱅크',
  '토스뱅크': '토스',
  '토스': '토스',
  '새마을금고': 'MG새마을금고',
  '신협': '신협',
  '우체국': '우체국',
  '산림조합': '산림조합',
};

// --- Utilities ---

function normalizeName(name) {
  if (!name) return '';
  return name
    .replace(/(주식회사|\(주\)|주\)|㈜)/g, '')
    .replace(/(은행|저축은행|카드|증권|생명|손해보험|보험)/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function redactSecrets(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/(auth|key|token|secret)=([^&\s]+)/gi, '$1=REDACTED')
    .replace(/[a-zA-Z0-9]{32,}/g, (match) => match.length > 32 ? 'REDACTED_TOKEN' : match);
}

/**
 * Decodes ZIP entry names, handling CP949 encoding and NFC normalization.
 */
function decodeEntryName(entry) {
  const isUtf8 = (entry.generalPurposeBitFlag & 0x800) !== 0;
  const name = isUtf8 ? entry.fileName : iconv.decode(entry.fileNameRaw, 'cp949');
  return name.normalize('NFC');
}

/**
 * Reads all entries from the ZIP and indexes them by slug.
 */
async function indexIconsFromZip(zipPath) {
  return new Promise((resolve, reject) => {
    const icons = new Map(); 
    const detectedVariants = new Set();
    const detectedFormats = new Set();
    const sampleEntries = [];

    yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
      if (err) return reject(err);

      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        const decodedPath = decodeEntryName(entry);
        if (entry.fileName.endsWith('/')) {
          zipfile.readEntry();
          return;
        }

        const parts = decodedPath.split('/');
        const fileName = parts[parts.length - 1];
        const ext = fileName.split('.').pop().toUpperCase();

        // Heuristic variant/format detection
        parts.forEach(p => {
          if (['컬러', '회색', '흑백', 'Color', 'Gray', 'Black'].includes(p)) detectedVariants.add(p);
          if (['SVG', 'PNG'].includes(p.toUpperCase())) detectedFormats.add(p.toUpperCase());
        });
        detectedFormats.add(ext);

        if (sampleEntries.length < 3) sampleEntries.push(decodedPath);

        const hasVariantFolders = Array.from(detectedVariants).length > 0;
        const isTargetVariant = !hasVariantFolders || parts.some(p => p.includes(CONFIG.variant));
        const isTargetFormat = parts.some(p => p.toUpperCase().includes(CONFIG.format)) || ext === CONFIG.format;

        if (isTargetVariant && isTargetFormat) {
          const namePart = fileName.split('.').slice(0, -1).join('.');
          // Heuristic slug: extract the last part of underscores, or the whole name
          // e.g. 금융아이콘_SVG_신한 -> 신한
          // e.g. 신한 -> 신한
          const slugMatch = namePart.match(/_([^_]+)$/) || [null, namePart];
          const slug = slugMatch[1];
          icons.set(slug, { ext: ext.toLowerCase(), entry, zipfile });
        }
        zipfile.readEntry();
      });

      zipfile.on('end', () => {
        if (CONFIG.debugZip || icons.size === 0) {
          console.log(`[DebugZip] Detected Variants: ${Array.from(detectedVariants).join(', ') || 'None'}`);
          console.log(`[DebugZip] Detected Formats: ${Array.from(detectedFormats).join(', ') || 'None'}`);
          console.log(`[DebugZip] Sample entries:`);
          sampleEntries.forEach(s => console.log(`  - ${s}`));
        }
        resolve(icons);
      });

      zipfile.on('error', reject);
    });
  });
}

async function getBufferFromZip(zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, readStream) => {
      if (err) return reject(err);
      const chunks = [];
      readStream.on('data', chunk => chunks.push(chunk));
      readStream.on('end', () => resolve(Buffer.concat(chunks)));
      readStream.on('error', reject);
    });
  });
}

/**
 * Recursively searches for arrays that look like products.
 */
function findProductsInJson(obj) {
  if (!obj || typeof obj !== 'object') return [];
  
  // If it's an array, check if elements look like products
  if (Array.isArray(obj)) {
    const looksLikeProducts = obj.length > 0 && obj.some(item => item && (item.fin_co_no || item.fin_prdt_cd));
    if (looksLikeProducts) return obj;
    
    // Otherwise recurse into elements
    for (const item of obj) {
      const found = findProductsInJson(item);
      if (found.length > 0) return found;
    }
  } else {
    // If it's an object, check known keys first
    const knownKeys = ['products', 'items', 'data', 'baseList', 'result'];
    for (const key of knownKeys) {
      if (obj[key]) {
        const found = findProductsInJson(obj[key]);
        if (found.length > 0) return found;
      }
    }
    
    // Recurse into all keys
    for (const key in obj) {
      if (!knownKeys.includes(key)) {
        const found = findProductsInJson(obj[key]);
        if (found.length > 0) return found;
      }
    }
  }
  return [];
}

async function fetchJson(url) {
  if (CONFIG.debugApi) console.log(`[DebugApi] Fetching: ${redactSecrets(url)}`);
  try {
    const res = await fetch(url);
    if (CONFIG.debugApi) {
      console.log(`[DebugApi] Status: ${res.status} ${res.statusText}`);
      console.log(`[DebugApi] Content-Type: ${res.headers.get('content-type')}`);
    }
    
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${redactSecrets(text.slice(0, 200))}`);
    }
    
    try {
      return JSON.parse(text);
    } catch {
      console.error(`[DebugApi] Failed to parse JSON from: ${redactSecrets(text.slice(0, 300))}`);
      throw new Error('Invalid JSON response');
    }
  } catch (e) {
    throw new Error(`Fetch failed: ${e.message}`);
  }
}

async function collectProvidersFromApi() {
  console.log(`
--- Collecting providers from API (${CONFIG.baseUrl}) ---`);
  const providers = new Map(); 

  const types = CONFIG.type === 'both' ? ['deposit', 'saving'] : [CONFIG.type];

  for (const type of types) {
    for (let page = 1; page <= CONFIG.pages; page++) {
      const url = `${CONFIG.baseUrl}/api/finlife/${type}?topFinGrpNo=${CONFIG.topFinGrpNo}&pageNo=${page}`;
      try {
        const json = await fetchJson(url);
        const products = findProductsInJson(json);
        
        if (CONFIG.debugApi) console.log(`[DebugApi] Found ${products.length} product candidates in ${type} page ${page}`);

        products.forEach(p => {
          // Robust extraction: Check top-level or nested 'raw'
          const fin_co_no = p.fin_co_no || p.raw?.fin_co_no;
          const name = p.kor_co_nm || p.fin_co_nm || p.raw?.kor_co_nm || p.raw?.fin_co_nm || p.companyName || p.providerName || p.bankName;
          
          if (fin_co_no && name) {
            providers.set(String(fin_co_no), String(name));
          }
        });
      } catch (e) {
        console.error(`  [!] Failed to fetch ${type} page ${page}: ${e.message}`);
        if (page === 1) {
          console.log(`
[Troubleshooting]
1. Is the dev server running? (pnpm dev)
2. Is the port correct? (Current: ${CONFIG.baseUrl}, try 3001 if needed)
3. Check if FINLIFE_API_KEY is set in .env.local
4. Try accessing the URL in browser: ${redactSecrets(url)}
`);
          return providers; // Return what we have
        }
      }
    }
  }

  console.log(`  Done. Found ${providers.size} unique providers.`);
  return providers;
}

// --- Main Execution ---

async function main() {
  if (!fs.existsSync(CONFIG.zipPath)) {
    console.error(`[Error] ZIP file not found: ${CONFIG.zipPath}`);
    process.exit(1);
  }

  const iconMap = await indexIconsFromZip(CONFIG.zipPath);
  console.log(`[ZIP] Indexed ${iconMap.size} icons from ${CONFIG.zipPath}`);

  if (iconMap.size === 0 && CONFIG.failOnEmptyIcons) {
    console.error(`[Error] No icons found matching variant "${CONFIG.variant}" and format "${CONFIG.format}".`);
    process.exit(1);
  }

  const providerMap = await collectProvidersFromApi();
  
  if (providerMap.size === 0 && CONFIG.failOnEmptyProviders) {
    console.error(`[Error] No providers found from API. Aborting.`);
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  if (!fs.existsSync(path.dirname(REPORT_PATH))) {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  }

  const results = {
    generatedAt: new Date().toISOString(),
    zip: CONFIG.zipPath,
    variant: CONFIG.variant,
    format: CONFIG.format,
    matched: [],
    missing: [],
  };

  console.log(`
--- Matching and Copying ---`);

  for (const [fin_co_no, kor_co_nm] of providerMap.entries()) {
    let matchedIcon = null;

    // Strategy 1: Exact alias match
    for (const [alias, slug] of Object.entries(NAME_TO_SLUG_ALIASES)) {
      if (kor_co_nm.includes(alias)) {
        matchedIcon = iconMap.get(slug);
        if (matchedIcon) break;
      }
    }

    // Strategy 2: Normalized name match
    if (!matchedIcon) {
      const normalized = normalizeName(kor_co_nm);
      matchedIcon = iconMap.get(normalized);
    }

    // Strategy 3: Try removing "한국" prefix
    if (!matchedIcon && kor_co_nm.startsWith('한국')) {
      const withoutKorea = normalizeName(kor_co_nm.slice(2));
      matchedIcon = iconMap.get(withoutKorea);
    }

    if (matchedIcon) {
      const destFile = `${fin_co_no}.${matchedIcon.ext}`;
      const destPath = path.join(OUTPUT_DIR, destFile);

      if (fs.existsSync(destPath) && !CONFIG.overwrite) {
        console.log(`  [Skip] ${fin_co_no} (${kor_co_nm}) - Already exists.`);
        results.matched.push({ fin_co_no, kor_co_nm, file: destFile, status: 'skipped' });
        continue;
      }

      if (!CONFIG.dryRun) {
        const buffer = await getBufferFromZip(matchedIcon.zipfile, matchedIcon.entry);
        fs.writeFileSync(destPath, buffer);
      }

      console.log(`  [OK] ${fin_co_no} (${kor_co_nm}) -> ${destFile}`);
      results.matched.push({ fin_co_no, kor_co_nm, file: destFile, status: 'copied' });
    } else {
      console.log(`  [Missing] ${fin_co_no} (${kor_co_nm}) - No matching icon found.`);
      results.missing.push({ fin_co_no, kor_co_nm });
    }
  }

  // Final cleanup: close zip files
  const openZips = new Set([...iconMap.values()].map(v => v.zipfile));
  for (const z of openZips) z.close();

  fs.writeFileSync(REPORT_PATH, JSON.stringify(results, null, 2));

  console.log(`
--- Summary ---`);
  console.log(`  Total Providers: ${providerMap.size}`);
  console.log(`  Matched: ${results.matched.length}`);
  console.log(`  Missing: ${results.missing.length}`);
  console.log(`  Report saved to: docs/ui/providers.logo-map.json`);
}

main().catch(err => {
  console.error('[Fatal Error]', redactSecrets(err.message));
  if (CONFIG.debugApi || CONFIG.debugZip) console.error(err);
  process.exit(1);
});
