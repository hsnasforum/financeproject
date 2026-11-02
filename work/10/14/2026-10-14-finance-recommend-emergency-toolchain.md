# 2026-10-14 추천 예금자보호 순서·비상금 6개월 통일·Node 고정·만료 연금 예외 정리

기준: branch `checkpoint/finance-review-20261011`, HEAD `eb6eb922f7d6e1609958d3e835a947ef5736ffe8`. 시작 시 staged 0, 추적 수정은 기존 `work/10/10/2026-10-10-finance-remaining-release-validation.md` 1개(보존, 미변경), 비추적 `.data/planning-debug-access-check/`·`__meta/`·`tmp/`(보존).
2026-10-14 KST 사용자 요청: 분석에서 제안한 다음 단계를 순차 진행, 비상금 기준은 6개월로 통일, 만료 연금 예외는 합리적으로 판단해 처리.

## 결과

- IMPLEMENTED / TEST_PASSED: 아래 4개 항목을 소스에 반영했습니다. commit·push·배포·설치본/사용자 DB 변경·live API 호출은 하지 않았습니다.
- REVIEW_CANDIDATE_WITH_LIMITATIONS / NOT_RELEASE_READY / ROOT_CAUSE_OPEN 판정은 바뀌지 않습니다. braces 보안과 연금 원천 차단은 그대로이며, 이번 변경으로 `freshness:release`는 연금 stale을 정확한 이유로 계속 차단합니다.

## 변경 파일

- 추천: `src/lib/recommend/score.ts`, `src/app/api/recommend/route.ts`, `tests/recommend-score.test.ts`, `tests/recommend-api.test.ts`
- 비상금 기준: `src/lib/planning/calc/emergencyFundPolicy.ts`(신규), `src/lib/planning/calc/index.ts`, `src/lib/planning/core/v2/policy/presets.ts`, `src/lib/planning/engine/financialStatus.ts`, `src/lib/planning/engine/validateInput.ts`, `src/lib/planning/core/v2/actions/buildActions.ts`, `src/lib/planning/core/v2/simulateMonthly.ts`, `src/app/api/planning/v2/optimize/route.ts`, `src/components/planning/workspace/useWorkspaceExecutionOptionsBundle.ts`, `src/lib/planning/catalog/planningPolicy.ts`, `src/lib/planning/reports/recommendationSignals.ts`, `src/lib/planning/v3/service/draftFromCashflow.ts`
- 비상금 테스트: `tests/planning/emergencyFundStandard.test.ts`(신규), `tests/planning/v2/insights/diagnosisAssessment.test.ts`, `tests/planning/v2/insights/interpretationVm.test.ts`, `tests/planning/reports/diagnosis-consistency.test.tsx`, `tests/planning/reports/recommendationSignals.test.ts`, `tests/planning-v3-profileDraftFromCashflow.test.ts`
- Node 고정: `.nvmrc`(신규), `.github/workflows/e2e-smoke.yml`, `.github/workflows/daily-refresh.yml`, `.github/workflows/rules-tune-pr.yml`, `tests/quality-gates-registry.test.ts`, `tests/daily-refresh-workflow-contract.test.ts`
- freshness: `config/data-freshness-exceptions.json`
- 문서: `docs/planning-v2-policy-defaults.md`, `docs/planning-v2-changelog.md`, `docs/package-scripts.md`, 이 기록

## 사용 skill

- 없음

## 변경 이유와 핵심 변경

### 1. 추천 예금자보호 적용 순서
`recommendCandidates`가 상위 N개로 자른 뒤 라우트가 `require`/`prefer`를 적용했습니다. 보호 상품이 N위 밖이면 `require`는 결과가 줄거나 "후보 없음"이 되고, `prefer` 가산점은 N위 밖 상품을 끌어올리지 못했습니다.
`recommendCandidates`가 선택 입력 `depositProtection`을 받아 전체 채점 결과에 정책을 적용한 뒤 정렬·절단합니다. 라우트는 그 결과를 그대로 사용합니다. 정책 없이 호출하면 기존 순위·출력이 같습니다. 보호 신호 연결 키(`fin_prdt_cd`)는 바꾸지 않았습니다.

### 2. 비상금 기준 6개월 통일
단계 엔진·행동 제안·입력 화면은 6개월, `balanced`/`growth` preset·optimizer 기본값·해석 caution·추천 신호·v3 초안은 3개월이었습니다. 같은 실행에서 "비상금 단계"와 "비상금 양호", 입력 화면 "비상금 기준(6개월)"과 근거 패널 "정책 기준 3개월"이 함께 나올 수 있었습니다.
`EMERGENCY_FUND_TARGET_MONTHS = 6`을 `src/lib/planning/calc/emergencyFundPolicy.ts` 한 곳에 두고, 위 소비처가 모두 참조합니다. 해석 정책은 `caution: 6`, `risk: 1`(변경 없음)입니다.
- `balanced`는 `emergencyFirst=false`라 배분 결과가 같고 `EMERGENCY_TARGET_REACHED/DROPPED` trace 시점만 달라집니다. `growth`는 잔고가 6개월치 미만인 동안 투자 비중을 0으로 둡니다.
- 시뮬레이션 trace 문구가 preset과 무관하게 "3개월 지출"로 고정돼 있던 것을 실제 적용 개월 수로 표시합니다.
- 저장된 실행은 생성 당시 `reproducibility.policy`를 유지하므로 기존 리포트 판정은 바뀌지 않고 새 실행부터 6개월이 적용됩니다. 리포트→추천 신호도 실행별 저장 정책을 따릅니다. 정책이 저장되지 않은 실행만 새 기준으로 표시됩니다.
- 테스트 fixture 중 "기본 지표 양호"를 뜻하던 비상금 4개월은 새 기준 최소값 6개월로 올리고, 4개월은 이제 `CAUTION`이라는 사례와 0.99/1/5.99/6개월 경계를 별도로 추가했습니다. 기존 기대값을 완화하지 않았습니다.

### 3. Node 22.22.2 실행 환경
`engines.node`는 22.22.2인데 WSL `/usr/bin/node`는 2026-09-05 apt 업그레이드로 22.23.2, nvm 대화형 기본은 24.18.0이었습니다. 24.18.0에서는 `better-sqlite3`가 ABI 불일치로 로드되지 않았습니다. pnpm 9.15.9는 engines 불일치를 경고만 하고 설치를 계속하는 것도 빈 임시 폴더에서 확인했습니다.
- 검토본에 포함된 Node 22.22.2 배포본을 `~/.nvm/versions/node/v22.22.2`로 복사했습니다(네트워크·시스템 패키지 변경 없음, binary sha256 `81925c0995b5c1427b5d538e6a90ca2fdc4daffb786b09af749beaf7369d4e90`, 공식 SHASUMS 대조는 오프라인이라 미실행). nvm 기본 alias는 바꾸지 않았습니다.
- 저장소에 `.nvmrc`(22.22.2)를 추가했습니다.
- Node 20(2026-04 EOL)으로 남아 있던 `e2e-smoke`(3곳)·`daily-refresh`·`rules-tune-pr`를 22.22.2로 맞추고, 계약 테스트가 하드코딩 대신 `package.json` engines를 기준으로 모든 workflow의 setup-node를 검사하게 했습니다.

### 4. 만료된 연금 freshness 예외
`finlife_pension_snapshot.json` 예외가 2026-09-30에 만료되어 `data_freshness_report.mjs`가 strict 여부와 무관하게 예외를 던졌고 `data:doctor`·`verify`·CI의 data:doctor 단계가 중단됐습니다.
기한 연장은 원천 계약 위반 상태의 6월 snapshot을 출시 게이트에서 통과시키므로 하지 않았습니다. 만료 항목만 제거해 일반 점검은 stale 경고로 남기고 strict 출시 검사는 계속 차단하게 했습니다. 연금 snapshot·원천 파일은 변경하지 않았습니다. 상품 화면에 수집 주기 경과 시 "상태: 기준 지남"을 표시하는 경로가 코드에 있음은 확인했지만 실제 화면은 이번에 열지 않았습니다.

## 검증

격리 실행: `/tmp/finance-verify-20261014/workspace`(HEAD shared clone + 현재 delta 복사 + hardlink node_modules), 대조용 `/tmp/finance-verify-20261014/baseline`(HEAD 그대로). bwrap으로 원본 루트 read-only, 네트워크 차단, 별도 HOME, `.env`·사용자 데이터 미포함, Node 22.22.2, `CI=true`, `DATABASE_URL=file:./prisma/ci.db`. Playwright 설정이 `**/tmp/**`를 무시하므로 E2E는 sandbox 안 `/srv/verify`로 마운트해 실행했습니다. 로그는 같은 루트의 `logs/`.

| 검사 | 결과 |
| --- | --- |
| 추천 새 테스트 RED(HEAD `score.ts`) | 3 실패 / 6 통과 |
| 추천 관련 10파일 | 58 통과 |
| CI 계약 새 guard RED(HEAD workflow) | 3 실패, Node 20 위치 5곳 검출 |
| CI 계약 5파일 | 84 통과 |
| 비상금 변경 영향 6파일(갱신 후) | 60 통과 |
| 전체 `vitest run` | 928파일 중 921 통과, 4,479 통과 / 27 실패 / 4 skip. 27개는 HEAD baseline에서도 동일 테스트·동일 메시지로 실패(신규 실패 0) |
| `pnpm lint` | 오류 0 |
| `pnpm typecheck` | HEAD와 같은 기존 7개 오류만(아래 리스크), 변경 파일 신규 오류 0 |
| `typecheck:planning`, `typecheck:planning:v3` | 통과 |
| `freshness` 일반 check-only | exit 0, fresh 1 / stale 7 / exceptions 0 |
| `pnpm data:doctor` | exit 0 (HEAD baseline은 `expired freshness exception`으로 exit 1) |
| `pnpm freshness:release` | exit 1, stale 7로 출시 차단 유지(의도) |
| `pnpm planning:v2:regress` | 9 케이스 PASS, full E2E 10 통과 |
| `pnpm planning:v2:complete` | PASS (guard, sec:check, freeze guard WARN-informational, scan guards, report/guide test, smoke, fast E2E 8 통과) |
| `pnpm e2e:pw tests/e2e/recommend-result-profile-snapshot.spec.ts --workers=1 --retries=0` | 1 통과 |
| `pnpm planning:ssot:check` | 통과 |
| `git diff --check`, CRLF 검사 | 통과 |
| `pnpm multi-agent:guard` | FAIL 4건, HEAD baseline과 동일. HEAD commit에 포함된 `work/10/11/2026-10-11-finlife-loan-schema-contract.md`가 최신 기록으로 선택되어 제목 날짜·남은 리스크·다음 라운드 누락을 지적(기존). 이 기록은 guard의 형식 항목 6개를 모두 충족 |

미실행: production build, desktop package/install/smoke, `release:verify`, Windows 실제 화면, live FINLIFE/EXIM 조회.

## 남은 리스크

- 저장소 `node_modules`가 2026-08-24 설치 상태로 lockfile과 다릅니다(Next 16.2.12 ↔ 16.3.8, vitest 4.1.9). 생성된 Prisma client에 10/11의 `identityKey`가 없어 전체 `tsc`가 기존 7개 오류(`src/lib/sources/unifiedLoaders.ts` 6, `tests/finlife-sqlite-identity-migration.test.ts` 1)를 냅니다. 재설치는 네트워크가 필요해 실행하지 않았습니다.
- 전체 테스트의 기존 실패 27개: 25개는 sandbox 환경(`OWNER_RESTORE_DIRECTORY_UNTRUSTED:/`, 빈 SQLite, news/real Prisma)으로 보이며, `tests/planning-v2-api/runs-report-route.test.ts`의 "10초 판정" 기대값은 10/11 진단 표시 개편 이후 갱신되지 않은 기존 불일치로 추정합니다. 이번에 수정하지 않았습니다.
- v2 동결 영역 4개 파일이 바뀌었습니다. commit 시 `[v2-core-change]` 태그가 필요합니다.
- `multi-agent:guard`는 `release:verify`의 필수 gate인데, 과거 기록 형식 누락으로 HEAD부터 실패 상태입니다. 과거 기록은 보존 원칙에 따라 수정하지 않았습니다.
- 추천 보호 신호는 여전히 `fin_prdt_cd`만으로 연결합니다(회사 간 동일 코드 충돌 가능성은 기존과 동일).
- `docs/planning-v2-policy-defaults.md`의 DSR(40/60)·월잉여 riskMax(-1) 값이 코드(30/50, 0)와 다른 기존 drift는 확정 계약이 불명확해 고치지 않았습니다.
- 정책이 저장되지 않은 오래된 실행은 열람 시 6개월 기준으로 판정됩니다. legacy planner(`src/lib/planner`, 미노출)의 3~6개월 안내 문구는 변경하지 않았습니다.

## 다음 라운드

- 승인 시 Node 22.22.2에서 `corepack pnpm install --frozen-lockfile`(postinstall `prisma generate` 포함)로 의존성 drift를 해소하고 전체 `tsc`·build를 다시 확인합니다.
- `runs-report-route` 기대값 불일치 확인, 문서 DSR drift의 확정값 결정.
- 커밋 범위 승인 시 `[v2-core-change]` 태그로 로컬 commit.
