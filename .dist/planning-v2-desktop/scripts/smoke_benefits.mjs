const baseUrl = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");

const paths = [
  "/api/public/benefits/search?query=%EC%B2%AD%EB%85%84&scan=all&sido=%EB%B6%80%EC%82%B0&limit=200&maxPages=auto&rows=200",
  "/api/public/benefits/search?query=%EC%B2%AD%EB%85%84&mode=all&scan=all&sido=%EB%B6%80%EC%82%B0&limit=200&maxPages=auto&rows=200",
  "/api/public/benefits/search?query=%EC%B2%AD%EB%85%84&mode=all&scan=all&sido=%EB%B6%80%EC%82%B0&sigungu=%EA%B8%88%EC%A0%95%EA%B5%AC&limit=200&maxPages=auto&rows=200",
];

async function runOne(index, path) {
  const url = `${baseUrl}${path}`;
  const started = Date.now();
  try {
    const res = await fetch(url);
    const elapsed = Date.now() - started;
    let okValue = null;
    let codeValue = null;
    let traceIdValue = null;
    try {
      const body = await res.clone().json();
      okValue = body?.ok ?? null;
      codeValue = body?.error?.code ?? null;
      traceIdValue = body?.error?.traceId ?? null;
    } catch {
      // ignore non-json
    }
    console.log(
      `[${index}] status=${res.status} time=${elapsed}ms ok=${String(okValue)} code=${String(codeValue)} traceId=${String(traceIdValue)}`,
    );
    return res.status;
  } catch (error) {
    const elapsed = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[${index}] connection failed time=${elapsed}ms error=${message}`);
    throw error;
  }
}

async function main() {
  console.log(`BASE_URL=${baseUrl}`);
  try {
    for (let i = 0; i < paths.length; i += 1) {
      await runOne(i + 1, paths[i]);
    }
  } catch {
    process.exit(2);
  }
}

main();
