# 2026-06-28 P2-02 v3 canonical root

## 변경 파일
- `package.json`
- `tsconfig.planning-v3.json`
- `scripts/planning_v2_desktop_build.mjs`
- `tests/planning-v3-canonical-source-contract.test.ts`
- `tests/desktop-artifact-provenance.test.ts`
- `planning/v3/**/*.ts`: 루트 v3 구현을 canonical `src` 모듈로 향하는 호환 wrapper로 축소
- `src/lib/planning/v3/**/*`: news, indicators, exposure, journal, routines, scenarios, ops, report 구현을 canonical 위치로 복사 및 import 정리
- `src/app/api/planning/v3/news/digest/route.ts`
- `src/app/planning/v3/news/_components/NewsDigestClient.tsx`
- `work/6/28/2026-06-28-p2-02-canonical-root-plan.md`
- `work/6/28/2026-06-28-p2-02-v3-canonical-root.md`

## 사용 skill
- `planning-gate-selector`: v3 source layout, package script, typecheck, desktop artifact 변경에 필요한 검증 범위를 고르는 데 사용했습니다.
- `work-log-closeout`: `/work` 종료 기록의 포함 항목과 실제 실행 결과 기록 기준을 확인하는 데 사용했습니다.

## 변경 이유
- P2-02 기준은 planning v3 canonical library root를 하나로 정하고, 루트 `planning/v3`와 `src/lib/planning/v3`의 양방향·deep relative 의존을 제거하는 것입니다.
- 기존 `v3:*` package script는 루트 `planning/v3` 구현을 직접 실행했고, desktop builder는 루트 `planning` 복사를 명시하지 않아 packaged runtime에서 v3 CLI 파일 소유권이 불명확했습니다.
- `tsconfig.planning.json`은 v3를 exclude하고 있어 planning v3 전용 typecheck 범위가 없었습니다.

## 직접 변경
- 루트 `planning/v3/**/*.ts` 비테스트 구현 파일 88개를 `src/lib/planning/v3` canonical tree로 복사하고, 루트 파일은 `@/lib/planning/v3/...` wrapper로 전환했습니다.
- 기존 API/UI 호환 digest adapter는 `src/lib/planning/v3/news/digestReader.ts`로 분리하고, `digest.ts`는 v3 digest builder 구현으로 돌렸습니다.
- `v3:doctor`, refresh/export/restore/report 등 package script를 `src/lib/planning/v3/...` 경로로 변경했습니다.
- `typecheck:planning:v3`와 `tsconfig.planning-v3.json`을 추가했습니다.
- desktop build가 v3 CLI entrypoint와 `tsconfig.planning-v3.json` 존재를 확인하고 artifact에 포함되도록 했습니다.
- indicators/news fixture asset을 canonical `src/lib/planning/v3` 아래에도 포함해 CLI와 테스트가 `import.meta.url` 기준 자산을 찾도록 했습니다.

## 검증
- 수정 전 실패: `corepack pnpm test tests/planning-v3-canonical-source-contract.test.ts` 5개 테스트 실패(src가 root 구현 역참조, root 구현 직접 보유, v3 script root 실행, v3 typecheck 없음, desktop v3 inventory 없음).
- 통과: `corepack pnpm test tests/planning-v3-canonical-source-contract.test.ts` (5개)
- 통과: `corepack pnpm test tests/planning-v3-canonical-source-contract.test.ts tests/desktop-artifact-provenance.test.ts` (9개)
- 중간 실패 후 수정: `corepack pnpm test planning/v3` 1차 fixture 누락 2개 실패, 2차 sample-items wrapper 복사 문제 15개 실패
- 최종 통과: `corepack pnpm test planning/v3` (61 files, 173 tests)
- 통과: `corepack pnpm typecheck:planning:v3`
- 통과: `corepack pnpm typecheck`
- 통과: `corepack pnpm lint`
- 통과: `corepack pnpm v3:doctor` (`ok=true`, checks=8, files=716, errors=0, warnings=0)
- 통과: `corepack pnpm planning:v2:desktop:build` (`.dist/planning-v2-desktop` 생성, 내부 Next build 포함)
- 통과: `corepack pnpm planning:v2:desktop:smoke` (`PASS`, runId=`754d7511-37f2-4891-be2e-380cbe41fd6a`; `DEV_ACTION_TOKEN` 미설정으로 ops doctor API만 skip 경고)
- 통과: `git diff --check`

## 남은 리스크
- 이번 변경은 source root와 packaging/typecheck 소유권 정리입니다. 저장 포맷, API 계약, 데이터 migration은 변경하지 않았고 migration 대상·충돌·quarantine 수는 모두 해당 없음입니다.
- 루트 `planning/v3` 테스트 파일과 fixture 파일은 호환성 확인을 위해 유지했습니다. 장기적으로 테스트 위치까지 `src` 기준으로 옮길지는 별도 구조 정리 이슈로 분리하는 편이 안전합니다.
- desktop smoke는 로컬 dev runtime 기반입니다. 실제 설치 artifact에서 `pnpm install --frozen-lockfile` 후 실행하는 별도 설치 검증은 이번 라운드 범위 밖입니다.
