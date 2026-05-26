# 2026-05-26 후보 비교 React Compiler 및 리포트 export production 보정

## 변경 파일
- `src/app/planning/reports/_components/CandidateComparisonSection.tsx`
- `src/app/api/planning/reports/[runId]/export.html/route.ts`
- `tests/planning-v2-api/reports-export-html-route.test.ts`
- `work/5/26/2026-05-26-candidate-comparison-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기록과 이번 planning/report 라운드에 맞는 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: React hooks 경고, report UI, export API route 변경에 맞춰 lint/test/build/e2e 검증 범위를 정했습니다.
- `route-ssot-check`: `/planning/reports` 사용자 경로와 export route guard 변경이 `docs/current-screens.md`의 Public Stable 경로와 충돌하지 않는지 확인했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 실패 후 보정 결과, 잔여 리스크를 `/work` 기록으로 정리했습니다.

## 변경 이유
- 최신 전체 ESLint 진단 기준 `CandidateComparisonSection.tsx`에 `react-hooks/set-state-in-effect` 경고 3건이 남아 있었습니다.
- 후보 비교 섹션은 `/planning/reports`의 사용자 노출 화면이므로 page reset, evidence overlay, 기본값 동기화를 React Compiler 친화적으로 바꾸되 UI 계약은 유지해야 했습니다.
- 검증 중 production build에서 `HTML 저장` 버튼이 `/api/planning/reports/[runId]/export.html`의 dev-only guard 때문에 JSON 404로 이동하는 문제가 재현됐습니다.

## 핵심 변경
- 후보 비교 pagination reset을 effect 동기 `setPage` 대신 `pageResetKey` 기반 파생 page state로 바꿨습니다.
- evidence overlay는 필터 변경 후 존재하는 row만 표시하도록 파생값으로 좁히고, scroll lock effect는 표시 가능한 row에만 반응하게 했습니다.
- payload 기본 금액/세율 동기화는 취소 가능한 timer callback으로 미뤄 effect 본문 동기 state 갱신을 제거했습니다.
- 전체 `react-hooks/set-state-in-effect` 잔여 수는 88건에서 85건으로 줄었습니다.
- report export route의 production dev-only 차단을 제거하고, 기존 local-host guard와 CSP/attachment 응답은 유지했습니다.
- production `NODE_ENV`에서도 로컬 HTML 다운로드가 200 attachment로 유지되는 API 테스트를 추가했습니다.

## 검증
- `corepack pnpm exec eslint src/app/planning/reports/_components/CandidateComparisonSection.tsx --rule react-hooks/set-state-in-effect:error` PASS
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-candidate-comparison.json` PASS
- `node -e "...tmp/eslint-react-hooks-set-state-after-candidate-comparison.json..."` INFO: 전체 잔여 85건
- `corepack pnpm exec playwright test tests/e2e/planning-v2-fast.spec.ts -g "/planning/reports shows run-based dashboard" --workers=1 --reporter=line` 1차 FAIL: dev 첫 컴파일 시간이 60초 테스트 제한을 잠식해 HTML download 대기 timeout
- `corepack pnpm exec playwright test tests/e2e/planning-v2-fast.spec.ts -g "/planning/reports shows run-based dashboard" --workers=1 --reporter=line --timeout=120000` PASS: 1 test
- `corepack pnpm exec eslint src/app/api/planning/reports/[runId]/export.html/route.ts tests/planning-v2-api/reports-export-html-route.test.ts src/app/planning/reports/_components/CandidateComparisonSection.tsx --rule react-hooks/set-state-in-effect:error` PASS
- `corepack pnpm test tests/planning-v2-api/reports-export-html-route.test.ts` PASS: 1 file / 4 tests
- `rg --files src/app -g 'page.tsx'` 실행: 실제 page route 표면 확인
- `rg -n -e '/planning/reports' -e '/api/planning/reports' docs/current-screens.md` 실행: `/planning/reports`, `/planning/reports/[id]` Public Stable 문서화 확인
- `corepack pnpm planning:current-screens:guard` PASS: 5 files / 9 tests
- `corepack pnpm lint` PASS
- `corepack pnpm test` PASS: 663 files / 2035 tests
- `corepack pnpm cleanup:next-artifacts` PASS: `.next-e2e-3126` 정리
- `corepack pnpm build` PASS
- `E2E_WEB_SERVER_MODE=production PORT=3151 PLAYWRIGHT_REUSE_EXISTING_SERVER=0 corepack pnpm exec playwright test tests/e2e/planning-v2-fast.spec.ts -g "/planning/reports shows run-based dashboard" --workers=1 --reporter=line` 1차 FAIL: export route production 404 재현
- 같은 production focused smoke 재실행 PASS: 1 test
- `corepack pnpm e2e:rc` PASS: 24 passed / 1 skipped
- `git diff --check` PASS

## 남은 리스크
- `react-hooks/set-state-in-effect`는 아직 85건 남아 있습니다. 다음 후보는 3건 군집인 `LabelingClient.tsx`, `OpsPlanningFeedbackClient.tsx`, `PlanningReportsClient.tsx` 중 사용자 경로 영향과 검증 비용을 비교해 고르는 편이 안전합니다.
- `e2e:rc` 로그에 `/planning/reports`의 `details open` hydration mismatch 경고가 남았습니다. 테스트는 통과했지만 다음 라운드의 별도 안정화 후보로 분리할 가치가 있습니다.
- export route는 production에서도 local-host guard 안에서만 열리도록 유지했습니다. 원격 배포에서 외부 브라우저 접근을 허용하려는 요구가 생기면 별도 보안 검토가 필요합니다.
- PR #24 병합은 원격 `main` 변경이므로 명시 승인 전에는 진행하지 않습니다.

## 다음 라운드
- 전체 `react-hooks/set-state-in-effect` 잔여 85건 중 3건 군집을 하나 더 줄입니다.
- `/planning/reports` hydration mismatch 경고는 React Compiler 경고 축소와 별도 안정화 후보로 보고 재현 범위를 먼저 좁힙니다.
- 다음 변경도 최신 `/work`와 원격 PR 상태를 확인한 뒤 manager 분해, 최소 수정, 검증, `/work` 기록 순서로 진행합니다.
