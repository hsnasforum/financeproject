# 2026-04-12 보안 하드닝 후속 정리

## 변경 파일
- `src/lib/planning/reports/standaloneHtmlReport.ts`
- `public/planning-report-print.js`
- `src/app/api/planning/reports/[runId]/export.html/route.ts`
- `src/lib/planning/v2/report/pdfReport.ts`
- `scripts/security_check.mjs`
- `tests/planning-v2-api/reports-export-html-route.test.ts`

## 사용 skill
- `work-log-closeout`: 후속 보안 라운드의 실제 변경과 실제 검증 결과를 `/work` 형식으로 정리

## 변경 이유
- 직전 보안 closeout에서 남겨 둔 리스크 두 개가 좁은 후속 수정으로 정리 가능한 상태였습니다.
- `standaloneHtmlReport`는 print view용 inline script를 직접 HTML에 주입하고 있었고, `pdfReport`는 `new Function(import)` 기반 동적 로더를 사용하고 있었습니다.

## 핵심 변경
- `src/lib/planning/reports/standaloneHtmlReport.ts`의 print view script를 inline code에서 외부 self script 참조로 변경했습니다.
- `public/planning-report-print.js`를 추가해 print view에서만 `window.print()`를 로드 후 실행하도록 분리했습니다.
- `src/app/api/planning/reports/[runId]/export.html/route.ts`에 route-level CSP를 추가해 export HTML 응답을 `default-src 'none'` 기준으로 좁히고, print view에서만 `script-src 'self'`를 허용하도록 했습니다.
- `src/lib/planning/v2/report/pdfReport.ts`의 Playwright 로더를 `new Function` 없이 `webpackIgnore` dynamic import로 교체했습니다.
- `scripts/security_check.mjs`에 `report-export-no-inline-print-script`, `pdf-report-no-new-function-loader` 검사를 추가해 재발을 막았습니다.
- `tests/planning-v2-api/reports-export-html-route.test.ts`를 새 동작에 맞게 갱신해 external print script와 stricter CSP를 검증하도록 했습니다.

## 검증
- `pnpm sec:check`
  - PASS
- `pnpm exec vitest run tests/planning-v2-api/reports-export-html-route.test.ts tests/planning-v2-api/runs-report-pdf-route.test.ts`
  - PASS (2 files, 7 tests)
- `pnpm exec eslint src/lib/planning/reports/standaloneHtmlReport.ts src/lib/planning/v2/report/pdfReport.ts src/app/api/planning/reports/[runId]/export.html/route.ts tests/planning-v2-api/reports-export-html-route.test.ts scripts/security_check.mjs public/planning-report-print.js`
  - PASS
- `pnpm sec:scan:routes`
  - PASS
- `pnpm build`
  - PASS
- `git diff --check -- src/lib/planning/reports/standaloneHtmlReport.ts src/lib/planning/v2/report/pdfReport.ts src/app/api/planning/reports/[runId]/export.html/route.ts tests/planning-v2-api/reports-export-html-route.test.ts scripts/security_check.mjs public/planning-report-print.js`
  - PASS

## 남은 리스크
- app-wide `script-src 'unsafe-inline'` 제거와 nonce 기반 CSP 전환은 아직 별도 큰 작업입니다.
- 이번 후속 라운드에서는 report export / PDF loader만 좁게 정리했고, 저장소 전체 `pnpm test`와 `pnpm e2e:rc`는 다시 돌리지 않았습니다.
- unrelated dirty worktree는 그대로 남아 있어, 다음 라운드에서도 변경 범위를 계속 좁게 잡아야 합니다.
