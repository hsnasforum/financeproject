# 2026-05-30 News settings controller React Compiler 경고 축소

## 변경 파일
- `src/app/planning/v3/news/settings/_components/newsSettings/useNewsSettingsController.ts`
- `work/5/30/2026-05-30-news-settings-react-hooks-plan.md`
- `work/5/30/2026-05-30-news-settings-controller-react-compiler.md`

## 사용 skill
- `planning-gate-selector`: React 훅/클라이언트 컨트롤러 변경에 맞춰 target ESLint, 관련 vitest, 전체 lint/test/build, multi-agent guard 검증 범위를 정했습니다.
- `work-log-closeout`: 실제 실행한 명령과 잔여 리스크를 `/work/5/30` closeout 형식으로 정리했습니다.

## 변경 이유
- News settings 컨트롤러의 초기 로딩 `useEffect` 안에서 비동기 로딩 결과를 직접 state commit하던 구조가 `react-hooks/set-state-in-effect` 경고를 만들 수 있었습니다.
- 설정 저장과 import apply 후 서버 재조회 경로도 같은 `load()` 흐름을 공유해, 경고 축소와 stale response 방어를 함께 정리할 필요가 있었습니다.
- optional specs/alert rules 조회 실패는 기존처럼 전체 설정 로딩을 깨지 않도록 유지해야 했습니다.

## 핵심 변경
- 서버 fetch와 state commit을 분리해 `load()`는 `NewsSettingsLoadResult`만 반환하고, `applyLoadResult()`가 한 번에 화면 상태를 반영하도록 바꿨습니다.
- mount effect에 `AbortController`, active flag, request sequence guard를 추가해 unmount/stale 응답에서 state commit을 피했습니다.
- 저장 및 import apply 후 재조회는 `reloadFromServer()`로 분리해 최신 요청만 화면에 반영하게 했습니다.
- indicator specs와 alert rules payload 변환을 순수 helper로 빼고, optional 조회 실패 시 기존 화면 상태을 유지하는 부분 실패 동작을 보존했습니다.
- 사전 계획 메모의 작성 시점 표현을 보정해 최종 closeout과 혼동되지 않게 했습니다.

## 검증
- `corepack pnpm exec eslint src/app/planning/v3/news/settings/_components/newsSettings/useNewsSettingsController.ts --rule react-hooks/set-state-in-effect:warn -f json` — PASS, messages `[]`
- `corepack pnpm exec vitest run tests/planning-v3-news-settings-ui.test.tsx tests/planning-v3-news-api.test.ts planning/v3/news/settings.test.ts` — PASS, 3 files / 18 tests
- `mkdir -p tmp && corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-news-settings-controller.json` — PASS, 전체 스캔 44 warnings / 37 files, 대상 컨트롤러 파일 0건
- `corepack pnpm exec vitest run tests/planning-v3-news-settings-remote-host-api.test.ts tests/news-exposure-api.test.ts tests/planning-v3-news-alert-rules-api.test.ts tests/planning-v3-indicators-specs-import-api.test.ts tests/planning-v3-write-route-guards.test.ts` — PASS, 5 files / 14 tests
- `git diff --check` — PASS
- `corepack pnpm lint` — PASS
- `find . -maxdepth 1 -type d -name ".next-build-*" -print` — PASS, 잔여 `.next-build-*` 없음
- `corepack pnpm test` — PASS, 663 files / 2035 tests
- `corepack pnpm build` — PASS
- `corepack pnpm multi-agent:guard` — 첫 실행 FAIL, 최신 closeout에 `## 다음 라운드` 섹션 누락 확인 후 문서 보강
- `corepack pnpm multi-agent:guard` — PASS, latestWorkNote=`work/5/30/2026-05-30-news-settings-controller-react-compiler.md`
- `git diff --check` — PASS

## 남은 리스크
- `react-hooks/set-state-in-effect` 전체 스캔은 아직 44 warnings / 37 files가 남아 있습니다. 이번 라운드 대상 컨트롤러는 목록에서 제거됐습니다.
- 저장/가져오기 플로우는 관련 단위/API 테스트와 빌드로 확인했지만, 실제 브라우저에서 폼 편집 후 저장하는 e2e는 이번 라운드에서 실행하지 않았습니다.
- 다음 우선순위는 planning v3 route-local 잔여 경고 중 `src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx` 또는 batch/list 계열 1건을 manager 분해 후 처리하는 것입니다.

## 다음 라운드
- manager 분해를 먼저 실행한 뒤 `src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx`의 `react-hooks/set-state-in-effect` 1건을 우선 검토합니다.
- profile draft 경로를 건드리면 `planning-v3-batch-contract-narrowing` skill 적용 여부를 먼저 확인하고, 관련 draft/profile 테스트와 build 필요성을 다시 고릅니다.
