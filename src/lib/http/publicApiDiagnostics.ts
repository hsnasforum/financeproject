export type PublicApiDiagnosticCode =
  | "BENEFITS_SNAPSHOT_MISSING"
  | "RECOMMEND_NO_CANDIDATES";

type OpsDiagnostic = {
  diagnosticId: string;
  code: PublicApiDiagnosticCode;
  hint: string;
};

const PUBLIC_MESSAGES: Record<PublicApiDiagnosticCode, string> = {
  BENEFITS_SNAPSHOT_MISSING: "공공 혜택 기준 데이터가 아직 준비되지 않았습니다. 잠시 후 다시 조회하거나 검색 범위를 줄여 주세요.",
  RECOMMEND_NO_CANDIDATES: "현재 조건에 맞는 상품 후보를 찾지 못했습니다. 조건을 넓히거나 잠시 후 다시 조회해 주세요.",
};

const OPS_DIAGNOSTICS: Record<PublicApiDiagnosticCode, OpsDiagnostic> = {
  BENEFITS_SNAPSHOT_MISSING: {
    diagnosticId: "benefits.snapshot.missing",
    code: "BENEFITS_SNAPSHOT_MISSING",
    hint: "Benefits snapshot is missing. Refresh it via /api/dev/benefits/snapshot/refresh.",
  },
  RECOMMEND_NO_CANDIDATES: {
    diagnosticId: "recommend.no_candidates",
    code: "RECOMMEND_NO_CANDIDATES",
    hint: "Product candidate pool is empty. Run pnpm live:smoke or pnpm products:sync.",
  },
};

export function publicErrorMessage(code: PublicApiDiagnosticCode): string {
  return PUBLIC_MESSAGES[code];
}

export function opsDiagnostic(code: PublicApiDiagnosticCode): OpsDiagnostic {
  return OPS_DIAGNOSTICS[code];
}

export function buildPublicDiagnosticMeta(
  code: PublicApiDiagnosticCode,
  input: { traceId: string; debug?: boolean },
): Record<string, unknown> {
  const diagnostic = opsDiagnostic(code);
  return {
    traceId: input.traceId,
    diagnosticId: diagnostic.diagnosticId,
    ...(input.debug ? { debug: { opsDiagnostic: diagnostic } } : {}),
  };
}

export function logPublicApiDiagnostic(input: {
  route: string;
  source: string;
  traceId: string;
  status: number;
  code: PublicApiDiagnosticCode;
}): void {
  console.warn("[public-api-diagnostic]", {
    route: input.route,
    source: input.source,
    traceId: input.traceId,
    status: input.status,
    diagnostic: opsDiagnostic(input.code),
  });
}
