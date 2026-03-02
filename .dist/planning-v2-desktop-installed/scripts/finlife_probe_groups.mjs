import {
  ensureFetchAvailable,
  getFinlifeConfig,
  parseProbeCandidates,
  maskUrl,
  fetchJsonWithDiag,
  extractFinlifeCounts,
  isFinlifeSuccess,
} from "./finlife_cli_common.mjs";

ensureFetchAvailable();
const { baseUrl, apiKey } = getFinlifeConfig();

function endpointFor(kind) {
  return kind === "deposit" ? "depositProductsSearch.json" : "savingProductsSearch.json";
}

function buildProbeUrl(kind, grp) {
  const url = new URL(`${baseUrl}/${endpointFor(kind)}`);
  url.searchParams.set("auth", apiKey);
  url.searchParams.set("topFinGrpNo", grp);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("rows", "1");
  return url.toString();
}

function topKeysOf(json) {
  if (!json || typeof json !== "object") return [];
  return Object.keys(json).slice(0, 10);
}

function summarizeBuckets(rows, keyName) {
  return Object.entries(rows)
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([k, v]) => `${keyName}:${k}=${v}`)
    .join(", ");
}

function inferLikelyCause({ statusBuckets, errCdBuckets, htmlLikeCount }) {
  const status403 = (statusBuckets["403"] ?? 0) + (statusBuckets["401"] ?? 0);
  if (status403 > 0) return "가능 원인: API 키/권한(401/403) 확인 필요";
  if ((statusBuckets["429"] ?? 0) > 0) return "가능 원인: 레이트리밋(429) 발생";
  if (htmlLikeCount > 0) return "가능 원인: 엔드포인트/URL 조합 오류(text/html 응답)";
  if ((errCdBuckets.FETCH_ERROR ?? 0) > 0) return "가능 원인: 네트워크/DNS/TLS 또는 방화벽으로 업스트림 연결 실패";
  if ((errCdBuckets.TIMEOUT ?? 0) > 0) return "가능 원인: 업스트림 응답 지연(타임아웃)";
  for (const [code, count] of Object.entries(errCdBuckets)) {
    if (code !== "000" && count > 0) return `가능 원인: FINLIFE err_cd=${code} 반환`;
  }
  return "가능 원인: 응답 파싱 키 불일치 또는 업스트림 장애";
}

async function main() {
  const candidates = parseProbeCandidates(process.env.FINLIFE_PROBE_GROUP_CANDIDATES);
  const debugMode = process.env.FINLIFE_PROBE_DEBUG === "1";
  const result = {
    deposit: { valid: [], counts: {} },
    saving: { valid: [], counts: {} },
  };
  const statusBuckets = {};
  const errCdBuckets = {};
  let nonJsonCount = 0;
  let htmlLikeCount = 0;
  let sampleDiag = null;
  const debugLines = [];

  for (const kind of ["deposit", "saving"]) {
    for (const grp of candidates) {
      const maskedUrl = maskUrl(buildProbeUrl(kind, grp));
      const diag = await fetchJsonWithDiag(buildProbeUrl(kind, grp), { timeoutMs: 10_000 });
      const statusKey = typeof diag.status === "number" ? String(diag.status) : "ERR";
      statusBuckets[statusKey] = (statusBuckets[statusKey] ?? 0) + 1;
      if (diag.errCd) errCdBuckets[diag.errCd] = (errCdBuckets[diag.errCd] ?? 0) + 1;
      if (!diag.contentType || !diag.contentType.includes("json")) nonJsonCount += 1;
      if ((diag.textPreview || "").trim().toLowerCase().startsWith("<html")) htmlLikeCount += 1;

      if (!sampleDiag && grp === "020000" && kind === "deposit") {
        sampleDiag = { kind, grp, diag, maskedUrl };
      }
      if (!sampleDiag) {
        sampleDiag = { kind, grp, diag, maskedUrl };
      }

      const counts = extractFinlifeCounts(diag.json);
      const hasData = (counts.totalCount ?? 0) > 0 || counts.baseListLen > 0;
      const success = isFinlifeSuccess(diag);
      if (success && hasData) {
        result[kind].valid.push(grp);
        if (typeof counts.totalCount === "number") result[kind].counts[grp] = counts.totalCount;
      }

      if (debugMode && debugLines.length < 5) {
        debugLines.push(
          `[debug] ${kind}:${grp} status=${diag.status ?? "ERR"} err_cd=${diag.errCd ?? "-"} total=${counts.totalCount ?? "-"} baseListLen=${counts.baseListLen} url=${maskedUrl}`,
        );
      }
    }
    result[kind].valid = [...new Set(result[kind].valid)].sort();
  }

  const recommended = [...new Set([...result.deposit.valid, ...result.saving.valid])].sort();

  console.log(`[finlife:probe] baseUrl=${baseUrl}`);
  console.log("[finlife:probe] endpoints=depositProductsSearch.json,savingProductsSearch.json");
  console.log(`[finlife:probe] candidates=${candidates.length}`);
  console.log(`[finlife:probe] deposit validGroups=${result.deposit.valid.join(",") || "(none)"}`);
  console.log(`[finlife:probe] saving validGroups=${result.saving.valid.join(",") || "(none)"}`);
  console.log(`[finlife:probe] deposit counts=${JSON.stringify(result.deposit.counts)}`);
  console.log(`[finlife:probe] saving counts=${JSON.stringify(result.saving.counts)}`);
  if (debugLines.length > 0) debugLines.forEach((line) => console.log(line));
  console.log(`Recommended FINLIFE_TOPFIN_GRP_LIST=${recommended.join(",")}`);

  if (recommended.length === 0) {
    console.log(`[finlife:probe] Summary: ${summarizeBuckets(statusBuckets, "status") || "status:(none)"}`);
    console.log(`[finlife:probe] Summary: ${summarizeBuckets(errCdBuckets, "err_cd") || "err_cd:(none)"}`);
    console.log(`[finlife:probe] Summary: nonJson=${nonJsonCount}, htmlLike=${htmlLikeCount}`);

    if (sampleDiag) {
      const sample = sampleDiag.diag;
      const keys = topKeysOf(sample.json).join("|") || "(none)";
      console.log(
        `[finlife:probe] Sample(${sampleDiag.grp} ${sampleDiag.kind}): status=${sample.status ?? "ERR"}, err_cd=${sample.errCd ?? "-"}, topKeys=${keys}, preview="${sample.textPreview || ""}", url=${sampleDiag.maskedUrl}`,
      );
    }
    console.log(`[finlife:probe] ${inferLikelyCause({ statusBuckets, errCdBuckets, htmlLikeCount })}`);
    process.exitCode = 2;
  }
}

void main();
