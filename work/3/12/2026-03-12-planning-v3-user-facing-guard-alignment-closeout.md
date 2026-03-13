# 2026-03-12 planning-v3 user-facing guard alignment

## 변경 파일
- `src/app/api/planning/v3/balances/monthly/route.ts`
- `src/app/api/planning/v3/categories/rules/route.ts`
- `src/app/api/planning/v3/categories/rules/[id]/route.ts`
- `src/app/api/planning/v3/scenarios/library/route.ts`
- `src/app/api/planning/v3/batches/route.ts`
- `src/app/api/planning/v3/batches/[id]/summary/route.ts`
- `src/app/api/planning/v3/import/csv/route.ts`
- `tests/planning-v3-user-facing-remote-host-api.test.ts`
- `tests/planning-v3-write-route-guards.test.ts`

## 사용 skill
- `planning-gate-selector`: planning-v3 user-facing API route 변경에 필요한 최소 검증 세트를 고르기 위해 사용
- `work-log-closeout`: 오늘 `/work` 종료 기록 형식과 필수 항목을 맞추기 위해 사용

## 변경 이유
- `/planning/v3/*` 사용자 화면이 직접 호출하는 API 중 일부가 여전히 `local-only` + `onlyDev()` 경로를 타고 있어서 Windows/remote same-origin 브라우저 경로에서 403 drift가 남아 있었습니다.
- 직전 배치에서 `balances/categories/scenarios`를 먼저 정리한 뒤 재스캔해 보니 `batches` 목록/요약과 `import/csv`에도 같은 계약 불일치가 남아 있었습니다.
- 이번 라운드 목표는 user-facing v3 화면이 쓰는 API를 모두 `same-origin + CSRF` 기준으로 정렬하고, non-user-facing route만 local-only를 유지하도록 닫는 것이었습니다.

## 핵심 변경
- `balances/monthly`, `categories/rules`, `scenarios/library`에서 `assertLocalHost`와 `onlyDev()`를 제거하고 same-origin + `requireCsrf(..., { allowWhenCookieMissing: true })`만 남겼습니다.
- `batches` 목록과 `batches/[id]/summary`도 같은 read guard 계약으로 맞춰 `/planning/v3/batches` 사용자 화면이 remote same-origin에서도 막히지 않게 했습니다.
- `import/csv`는 local-only/dev-only를 제거하고 same-origin + `requireCsrf(..., { allowWhenCookieMissing: true })`로 정렬했으며, guard 실패 시 `INPUT`으로 뭉개지지 않고 `ORIGIN_MISMATCH`/`CSRF_MISMATCH`를 그대로 돌려주도록 맞췄습니다.
- `tests/planning-v3-user-facing-remote-host-api.test.ts`에 `batches`, `batches/[id]/summary`, `import/csv` remote same-origin 회귀를 추가했습니다.
- `tests/planning-v3-write-route-guards.test.ts`에 `import/csv`를 user-facing write route로 편입하고, user-facing write는 same-origin remote host 허용, non-user-facing write만 local-only를 유지하는 계약을 다시 고정했습니다.
- 최종 재스캔 결과 `assertLocalHost`/`onlyDev()`가 남아 있는 planning-v3 route는 `transactions/overrides`, `transactions/batches/merge`, `transactions/batches/[id]/transfers`뿐이며, 현재 `src/app`, `src/components`, `src/lib` 기준 user-facing caller는 찾지 못했습니다.

## 검증
- `pnpm test tests/planning-v3-balances-api.test.ts tests/planning-v3-categories-rules-api.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts`
  - 1차 실행 실패: `scenarios/library` POST가 remote same-origin에서 403, `import/csv` guard code가 `INPUT`으로 내려와 계약 불일치 확인
- `pnpm test tests/planning-v3-balances-api.test.ts tests/planning-v3-categories-rules-api.test.ts tests/planning-v3-batch-center-api.test.ts tests/planning-v3/csv-import.test.ts tests/planning-v3/api-drafts-route.test.ts tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts`
  - PASS
- `pnpm exec eslint src/app/api/planning/v3/batches/route.ts src/app/api/planning/v3/batches/[id]/summary/route.ts src/app/api/planning/v3/import/csv/route.ts tests/planning-v3-user-facing-remote-host-api.test.ts tests/planning-v3-write-route-guards.test.ts`
  - PASS
- `pnpm build`
  - PASS
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-v3-import-to-cashflow.spec.ts tests/e2e/v3-draft-apply.spec.ts --workers=1`
  - PASS
- `pnpm multi-agent:guard`
  - PASS

## 남은 리스크
- `transactions/overrides`, `transactions/batches/merge`, `transactions/batches/[id]/transfers`는 여전히 local-only/dev-only를 유지합니다. 현재 스캔에서는 user-facing 호출이 없었지만, 이후 UI가 연결되면 같은 same-origin 계약 재검토가 필요합니다.
- `tests/planning-v3-user-facing-remote-host-api.test.ts`는 이번 라운드에서 새로 추가된 회귀 파일이라, 다음 batch에서 planning-v3 route를 더 정리할 때 이 파일을 기준 회귀 세트로 계속 유지하는 편이 안전합니다.
- route SSOT, current-screens, README, 운영 runbook 계약은 이번 라운드에서 바뀌지 않아 문서 수정은 하지 않았습니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
