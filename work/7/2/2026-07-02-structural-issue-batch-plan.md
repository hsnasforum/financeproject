# 2026-07-02 구조 Issue 등록/구현 배치 계획
## 변경 파일
- `work/7/2/2026-07-02-structural-issue-batch-plan.md`

## 사용 skill
- 없음

## 변경 이유
- 첨부 통합 Markdown 기준 12개 구조 이슈 후보를 GitHub 등록 준비, 우선순위별 구현 착수, 검증/문서화 흐름으로 나누는 메인 에이전트 계획이 필요했습니다.
- 메인 에이전트가 직접 수행할 구현/최종 검증과 병렬 가능한 조사/문서화 범위를 분리해 다음 라운드 인수 기준을 남깁니다.

## 확인한 사실
- 현재 브랜치: `codex/structural-issues-114-125-readiness`
- HEAD: `613abcf9`
- PR `#127`: OPEN / MERGEABLE / CI SUCCESS / E2E SUCCESS
- 기존 Issue `#114~#125`: OPEN 상태이나 첨부 후보 12개 제목과 1:1 일치하지 않음
- 최신 `/work` 기준으로 planning, route, user-scope, v2 gate, e2e gate는 최근 PASS 이력이 있음

## 영향 범위 초안
- planning server/provider wiring
  - `src/lib/planning/server/runs/*`
  - `src/lib/planning/server/store/*`
  - `src/lib/planning/storage/*`
  - `src/lib/planning/server/v2/*`
- planning v3 write/user-scope contract
  - `src/app/api/planning/v3/**`
  - `src/lib/planning/v3/service/*`
  - `src/lib/planning/profileScope.ts`
  - `tests/planning-v3-*-user-scope.test.ts`
  - `tests/planning-v3-write-route-guards.test.ts`
- products/finlife source integration
  - `src/lib/finlife/productsHttp.ts`
  - `src/lib/finlife/source.ts`
  - `src/app/api/products/unified/route.ts`
  - `tests/finlife-*.test.ts`
  - `tests/finlife-products-http-cache.test.ts`
- route/schema/scripts/docs
  - `docs/current-screens.md`
  - `docs/routes-inventory.md`
  - `scripts/providers-manifest.mjs`
  - `package.json`
  - `prisma/schema.prisma`
  - `prisma/schema.postgres.prisma`

## 단계 배치
1. Issue-현재코드 매핑과 GitHub 등록 단위 확정
   - 목적: 첨부 후보 12개를 기존 Issue `#114~#125`와 충돌 없이 재매핑하고, 새 Issue 생성이 필요한 항목과 기존 Issue 재서술로 충분한 항목을 구분합니다.
   - 추천 에이전트 타입: `researcher`
2. 최상위 차단 항목 직접 구현
   - 목적: `Critical core service provider wiring`, `Critical planning file-store process-local lock`, `High legacy planner compute`처럼 planning run 생성/저장 경로를 깨뜨릴 수 있는 항목을 메인 에이전트가 로컬에서 직접 수정합니다.
   - 추천 에이전트 타입: `developer`
3. 쓰기 경계와 계약 정리
   - 목적: `High planning v2 CSRF/write guard`, `High runStore 책임 분리`, `Medium planning run endpoint canonical contract`, `Medium user scope 명시화`를 한 묶음으로 처리해 write path, canonical owner, user scope를 정렬합니다.
   - 추천 에이전트 타입: `analyzer`
4. 제품/데이터소스/운영 표면 정리
   - 목적: `High Finlife productsHttp/source 통합`, `Medium createRunService 분리`, `Medium SQLite/Postgres schema parity`, `Medium route policy manifest`, `Low package scripts 분류`를 제품 surface와 운영 surface 기준으로 나눠 후속 구현과 문서화 순서를 고정합니다.
   - 추천 에이전트 타입: `planner`
5. 메인 최종 검증과 closeout
   - 목적: 메인 에이전트만 `pnpm build`, 필요 시 `pnpm e2e:rc`, 관련 planning gate, 문서/`/work` 갱신을 실행하고 최종 PASS/FAIL과 남은 리스크를 기록합니다.
   - 추천 에이전트 타입: `tester`

## 즉시 막는 핵심 경로
- 메인 에이전트 직접 수행
  - planning run 생성 경로의 provider wiring/lock/legacy compute 영향 분석
  - 관련 구현 수정
  - 최종 `pnpm build`, `pnpm e2e:rc`, planning gate 실행
  - GitHub Issue 등록 시 최종 제목/본문/우선순위 확정

## 병렬 가능 작업
- `researcher`: 첨부 후보 12개와 기존 Issue `#114~#125` 간 제목/범위 충돌표 작성
- `analyzer`: user path, API path, canonical owner, CSRF/user-scope 영향 경로 정리
- `documenter`: route/schema/scripts 변경 시 필요한 README/docs/`docs/current-screens.md` 갱신 범위 초안
- `tester`: 어떤 후보가 `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `planning:v2:complete`, schema drift 테스트를 요구하는지 분류

## 실행한 확인
- `work/7/2` 최신 문서 및 최신 검증 결과 확인
- `multi_agent.md` 확인
- `rg`로 planning runs/store/finlife/csrf/schema/script 관련 파일군 탐색

## 미실행 검증
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm e2e:rc`
- `pnpm planning:v2:complete`

## 이번 라운드 완료 항목
- 구조 이슈 후보 12개를 메인 소유 구현 축과 병렬 조사 축으로 분리했습니다.
- planning run/store, planning v3 write/user-scope, finlife/products, route/schema/scripts의 주요 영향 파일군을 식별했습니다.
- 다음 라운드에서 바로 GitHub Issue 등록 및 우선순위 구현을 시작할 수 있는 5단계 배치를 남겼습니다.

## 남은 리스크
- 기존 Issue `#114~#125` 본문과 첨부 후보 12개 범위가 일부 겹칠 수 있어 GitHub 등록 전 범위 표가 필요합니다.
- `Critical` 3개가 실제로 동일 원인인지, provider wiring/lock/legacy compute로 분리 가능한지는 코드 정독이 더 필요합니다.
- `route policy manifest`와 `package scripts 분류`는 운영 규칙 성격이 강해 다른 기능 이슈와 섞으면 범위가 퍼질 수 있습니다.

## 다음 라운드 우선순위
- `Critical core service provider wiring`
- `Critical planning file-store process-local lock`
- `High legacy planner compute`
- 이후 write guard/canonical contract/user scope 묶음으로 이동
