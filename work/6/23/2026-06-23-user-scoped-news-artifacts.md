# 2026-06-23 Planning v3 뉴스 산출물 사용자 스코프 고정

## 변경 파일
- `planning/v3/news/store/index.ts`
- `planning/v3/news/store/store.test.ts`
- `src/lib/planning/v3/news/digest.ts`
- `src/lib/planning/v3/news/scenarios.ts`
- `tests/planning-v3-news-user-scope.test.ts`
- `work/6/23/2026-06-23-user-scoped-news-artifacts.md`

## 사용 skill
- `finance-skill-routing`: 이번 라운드에 필요한 로컬 skill 선택.
- `planning-gate-selector`: Planning v3 뉴스 산출물 변경에 맞는 검증 게이트 선정.
- `work-log-closeout`: 변경 파일, 검증, 남은 리스크를 `/work` 종료 기록으로 정리.
- `gpt-5.3-codex-spark` + `xhigh`: AGENTS.md 조건부 지침에 따라 병렬 정적 조사와 테스트 후보 확인에 사용.

## 변경 이유
- Planning v3 뉴스 digest/scenario route가 사용자 namespace 활성 상태에서도 전역 legacy `.data/news/*.latest.json` 산출물을 읽을 수 있는 경계를 제거하기 위해서입니다.
- `/digest`, `/scenarios` 공개 payload 계약은 유지하되, 저장소 산출물은 `runWithPlanningUserScope` 기준의 사용자별 v3 artifact를 우선하도록 고정했습니다.

## 핵심 변경
- digest adapter가 v3 `digest.latest.json`과 `today/latest.json`을 먼저 읽고, 사용자 namespace 활성 시 legacy 전역 digest fallback을 차단합니다.
- scenario adapter가 v3 `scenarios.latest.json`과 `today/latest.json`을 먼저 읽고, 사용자 namespace 활성 시 legacy 전역 scenario fallback을 차단합니다.
- v3 store에 digest read helper를 추가하고 write/read 회귀 테스트를 보강했습니다.
- user-scope 테스트가 전역 legacy fixture와 사용자별 v3 artifact를 동시에 배치해 Alice/Bob/Charlie 격리를 검증합니다.
- route 응답의 기존 public shape는 legacy-compatible mapper로 유지했습니다.

## 검증
- `corepack pnpm test tests/planning-v3-news-user-scope.test.ts tests/planning-v3-news-api.test.ts planning/v3/news/store/store.test.ts`
- `corepack pnpm typecheck`
- `corepack pnpm lint`
- `corepack pnpm planning:user-scope:check`
- `corepack pnpm planning:auth:check`
- `corepack pnpm test tests/planning-v3-news-digest-indicator-root.test.ts planning/v3/news/recovery.test.ts tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts`
- `corepack pnpm sec:check`
- `corepack pnpm planning:ssot:check`
- `corepack pnpm test`
- `corepack pnpm build`

## 남은 리스크
- `items/search`는 아직 공유 SQLite/search index read-model 경계를 사용하므로 별도 문서화 또는 사용자 경계 테스트가 필요합니다.
- adapter가 v3 cache를 legacy route payload로 투영하므로 legacy-only 필드는 빈 배열 또는 null에 가까운 값으로 보존됩니다.
- UI/셀렉터 변경이 없어 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드 우선순위
1. Planning v3 news `items/search` 공유 read-model의 사용자 경계와 의도된 노출 범위를 문서화하고 테스트로 고정합니다.
2. Planning API route helper 표준화 후보 5개를 `requirePlanningRouteUser` 또는 `withPlanningRouteUser` 계층으로 정리합니다.
3. PostgreSQL 전환 전 schema contract와 SQLite export/dry-run checksum 게이트를 추가합니다.
