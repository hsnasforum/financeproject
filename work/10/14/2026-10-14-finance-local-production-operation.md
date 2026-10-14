# 2026-10-14 Finance 로컬 production 운영 복구

기준: [추천·비상금·Node 정리](2026-10-14-finance-recommend-emergency-toolchain.md). branch `checkpoint/finance-review-20261011`, HEAD `eb6eb922`.
사용자 승인(2026-10-14 KST): 의존성 재설치, 로컬 commit, "웹페이지가 정상적으로 운영될 수 있게" 작업. push·PR·배포는 승인 범위가 아니어서 하지 않았습니다.

## 결과

- RUNNING: 공식 Desktop Local launcher(`corepack pnpm start:local`, Node 22.22.2)로 `127.0.0.1:3100`에서 실행 중이며 기본 브라우저 bootstrap 요청까지 확인했습니다. 터미널 패널 탭에서 foreground로 실행되므로 Ctrl+C로 종료합니다.
- 인증 후 사용자 브라우저 화면은 직접 보지 못했습니다(one-shot session이 사용자 기본 브라우저로 전달됨). 같은 build의 공식 desktop smoke가 bootstrap·프로필·실행 생성 흐름을 통과했습니다.
- 출시 판정(braces 보안, 연금 원천)은 바뀌지 않습니다.

## 변경 파일

- 저장소: `tsconfig.json`(`work/local/**` exclude), `.data/finlife_deposit_snapshot.json`, `.data/finlife_credit-loan_snapshot.json`, `.data/finlife_mortgage-loan_snapshot.json`, `.data/finlife_rent-house-loan_snapshot.json`(공식 live sync 결과), 이 기록
- 저장소 밖 또는 비추적 상태: `node_modules` 재설치, `dev.db` 교체(이전 파일 보존), production data root의 `assumptions.latest.json`, `tmp/dart/corpCodes.index.json`, `.data/finlife_{saving,pension}_sync_attempt.json` 실패 marker, `.next` build

## 사용 skill

- anthropic-skills:built-in-browser

## 변경 이유와 핵심 변경

1. 의존성: `node_modules`가 2026-08-24 설치본으로 lockfile과 달랐습니다(Next 16.2.12 ↔ 16.3.8, vitest 4.1.9 ↔ 4.1.11, eslint-config-next 16.2.12 ↔ 16.3.8). Node 22.22.2에서 `corepack pnpm install --frozen-lockfile`을 실행했고 postinstall `prisma generate`로 `identityKey`가 반영된 client가 생성되었습니다. lockfile·package.json hash는 변하지 않았습니다.
2. DB: `.env.local`의 `DATABASE_URL=file:./dev.db`(2026-06-28)는 공식 식별 마이그레이션 점검에서 `blocked / UNSUPPORTED_LEGACY_SCHEMA`였고 launcher가 bind 전에 거부하는 상태였습니다. 읽기 전용 점검 결과 auth 테이블과 `userId` 컬럼이 없고 `UserProfile`·`Favorite`·`PlannerSnapshot`은 0행, 나머지는 재수집 가능한 공개 상품 캐시(Product 538, ProductOption 18,531 등)였습니다. 원본을 `work/local/db-backup-20261014/dev.db.legacy`로 이동해 보존(sha256 `a2dae0f6…` 동일, README에 복원 방법 기록)하고 공식 `prisma:db:push`로 새 빈 DB를 초기화했습니다. 점검 결과 `ready`.
3. 상품 데이터: 오래된 snapshot을 재생하면 `generatedAt`이 현재 시각으로 기록되어 최신처럼 보이므로 사용하지 않고, 설정된 키로 공식 `finlife:sync --kind=all`을 1회 실행했습니다.
   - 예금 39/158, 신용 44/139, 주담대 34/108, 전세 41/80 저장. DB integrity ok, FK 오류 0, `identityKey` null 0. 원문 공시월 202609.
   - 연금: `FINLIFE_INTEGRITY_FAILED`(기존 원천 결함), 기존 snapshot 보존.
   - 적금: `SYNC_FAILED`. 진단 결과 FINLIFE 응답 `HTTP ERR err_cd=TIMEOUT msg=timeout(10000ms)`였고, 같은 시점 직접 확인에서 적금·예금 endpoint 모두 `Empty reply from server`(약 10초)였습니다. 원천 서버 일시 장애로 판단해 timeout 코드를 바꾸지 않았고 시간 간격을 둔 재시도 1회도 실패했습니다. 기존 snapshot과 실패 marker를 보존했습니다.
4. 유지보수 창(앱 종료 후 각 1회): `datago:sync` KDB 예금 25개(처리 750행), DART 회사 인덱스 재생성 119,614개, `planning:assumptions:sync`를 `PLANNING_DATA_DIR=~/.local/share/PlanningV2/vault`로 production root에 저장(asOf 2026-10-14, 기준금리 3%, CD91 3.24%, 경고 5개: CPI 파싱 실패로 물가는 기본값 사용).
5. 빌드: 첫 `corepack pnpm build`가 비추적 증거 폴더 `work/local/**/*.spec.ts` 타입 검사로 실패했습니다. 소스 checkout에만 있는 로컬 작업 공간이므로 `tsconfig.json` exclude에 `work/local/**`를 추가했고 이후 build가 통과했습니다.
6. standalone 서버는 build 시점에 복사한 `.next/standalone/tmp/dart/`를 읽습니다. DART 인덱스를 갱신한 뒤에는 다시 build해야 화면에 반영되어 재빌드했습니다(BUILD_ID `TvAzG0m5NwdfhgZGwyqhn`).

## 검증

| 검사 | 결과 |
| --- | --- |
| `corepack pnpm install --frozen-lockfile` | exit 0, lockfile 불변, better-sqlite3 로드 확인 |
| 전체 `tsc --noEmit`(격리 사본) | exit 0 (기존 7개 오류 해소) |
| `pnpm lint`(격리 사본) | 오류 0, eslint-config-next 16.3.8 신규 규칙 경고 12개(기존 코드) |
| 전체 `vitest run`(격리 사본) | 4,480 통과 / 26 실패 / 4 skip. 26개는 HEAD baseline과 같은 sandbox 환경·기존 기대값 불일치 |
| `corepack pnpm build` | exit 0 (254 static pages) |
| `planning:v2:prod:smoke` | PASS (DART, standalone asset, 상품 카탈로그 DB 계약, data-sources, remote probe 403) |
| `planning:v2:desktop:smoke` | PASS (bootstrap·프로필·실행 생성, production-hidden route) |
| 실행 중 앱 HTTP | `/`, `/dashboard`, `/planning`, `/recommend`, `/products/catalog`, `/public/dart`, `/settings/data-sources`, `/tools/fx` 모두 200·오류 marker 0, 세션 없는 보호 API 401 |
| 내장 브라우저 | 상품 카탈로그 예금 39개·공시월·수집 시각 표시, 데이터 소스 "연결 준비 6/6, 주의 1(가정 snapshot 부분 수집)" |

미실행: 사용자 Windows 브라우저의 인증 후 화면 직접 확인, E2E 전체, `release:verify`, native Windows 설치.

## 운영 방법

- 시작(Windows PowerShell): `wsl -d Ubuntu --exec bash -lc 'cd ~/code/finance && PATH=$HOME/.nvm/versions/node/v22.22.2/bin:$PATH corepack pnpm start:local'`
  - `--exec`가 필요합니다. `wsl -- ...` 형식은 wsl이 기본 shell로 인자를 다시 해석해 `$PATH`가 먼저 확장됩니다(확인함).
- WSL 터미널: `cd ~/code/finance && nvm use && corepack pnpm start:local`
- 실행 중 브라우저 세션이 사라지면 같은 시작 명령을 다시 실행하면 새 one-shot session이 발급됩니다.
- 종료: 실행 중인 터미널에서 Ctrl+C. 데이터 갱신 명령은 앱 종료 후 실행합니다.

## 남은 리스크

- 적금이 DB에 없어 통합 카탈로그·추천에서 적금 후보가 0개입니다. FINLIFE 회복 후 앱을 종료하고 `corepack pnpm finlife:sync --kind=saving`을 실행해야 합니다.
- 연금 원천 결함과 freshness 출시 차단, braces 보안 차단은 그대로입니다.
- 가정 snapshot의 CPI 수집이 실패해 물가는 기본값(2%)입니다. KOSTAT CPI 파싱 실패 원인은 조사하지 않았습니다.
- DART 인덱스·공시 산출물은 build 시점 복사본을 사용하므로 갱신 후 재빌드가 필요합니다.
- `runs-report-route`의 "10초 판정" 기대값 불일치와 `multi-agent:guard`의 과거 기록 형식 누락은 기존 문제로 남겼습니다.
- 앱은 터미널 탭이 열려 있는 동안만 실행됩니다. 이 대화의 임시 시작 스크립트 대신 위 시작 명령을 사용하세요.

## 다음 라운드

- FINLIFE 회복 후 적금 동기화, KOSTAT CPI 파싱 원인 확인.
- 승인 시 원격 push/PR.

## 후속: API 키 정리·적금 수집·DART 실시간 조회 복구 (14:35~15:00 KST)

- 사용자가 `OPENDART_API_KEY`에 넣은 32자리 키는 OpenDART에서 `010` 미등록이었고, FINLIFE API에서는 `000 정상`이었습니다. FINLIFE 키로 확인되어 사용자가 `FINLIFE_API_KEY`(새 키)와 `OPENDART_API_KEY`(40자리)를 직접 정리했습니다. 최종 `.env.local`은 각 키가 한 줄씩이며 두 키 모두 실제 호출 `000 정상`입니다. 키 값은 출력·기록하지 않았습니다.
- 정정: 위 본문에서 "원천 서버 일시 장애"로 적은 적금 실패의 실제 원인은 응답 지연이었습니다. 정상 응답에 약 15초가 걸려 `fetchFinlifePage`의 10초 고정 timeout에서 매번 끊겼습니다. 수집 timeout을 `FINLIFE_SYNC_TIMEOUT_MS`(기본 30초, 500~120000ms, 빈 값은 기본값)로 조정 가능하게 했고, 이후 적금 59/178 수집 성공, 실패 marker가 자동 정리되었습니다.
- DART 실시간 조회(기업 개황·공시 목록)가 `502 UPSTREAM`이었습니다. 원인은 env의 legacy `OPENDART_API_URL`이 `/api`로 끝나는데 코드가 다시 `/api`를 붙여 `/api/api/company.json`을 호출한 것입니다(키와 무관한 기존 결함). `resolveDartBaseUrl`이 끝의 `/api`를 정리하도록 고쳐 두 env 형식을 모두 받게 했습니다.
- 변경 파일: `scripts/finlife_cli_common.mjs`, `tests/finlife-sync-timeout.test.ts`(신규), `docs/finlife-sync.md`, `src/lib/publicApis/dart/baseUrl.ts`, `tests/dart-base-url-env.test.ts`, `docs/opendart-setup.md`, `.data/finlife_saving_snapshot.json`(live sync), 이 절.
- 검증: DART URL 새 테스트 RED(HEAD 코드에서 4 실패) → 수정 후 DART·공시 29파일 111 통과, FINLIFE 49파일 203 통과, 변경 파일 lint 오류 0, 전체 `tsc` 통과, production build 통과(첫 build는 테스트의 JSDoc 타입 누락으로 실패 후 수정), 재시작 후 앱에서 적금 59개, 기업 개황 200(삼성전자(주)), 공시 목록 200·3건, 주요 화면 200.
- 남은 것: 연금은 원천 결함으로 실패 marker를 유지합니다. 이 후속 변경은 아직 commit하지 않았습니다.

## 후속: PR #301 E2E seed fixture 정리 (15:20~15:40 KST)

- PR #301의 E2E Smoke 3개 job이 `pnpm seed:debug` 단계에서 `FINLIFE integrity: normalized/raw product identity mismatch`로 실패했습니다. 10/11 식별 검증 강화 이후 2월 fixture `tests/fixtures/finlife_deposit.normalized.json`의 원문(`raw`)에 회사·상품코드·공시월이 없었던 것이 원인이며, 오늘 commit 이전(`eb6eb922`)에서도 같은 실패를 재현했습니다.
- fixture 상품 2개·옵션 3개의 원문에 정규화 값과 같은 `fin_co_no`, `fin_prdt_cd`, `dcls_month=202602`와 이름·금리를 채웠습니다. 상품 식별자와 기존 테스트 기대값은 그대로입니다.
- 검증(격리 사본, 네트워크 차단, CI env 동일): fixture 관련 단위·FINLIFE 50파일 206 통과, `prisma:db:push` → `seed:debug`(FINLIFE·KDB 재생) 통과, core flows E2E 43 통과 / 2 skip / 1 실패.
- 남은 실패 `error-state-retry.spec.ts` "benefits exposes the default retry action"은 `/benefits`에서 실패 알림이 나타나지 않는 문제로, 오늘 commit 이전 사본에서도 동일하게 실패하는 기존 문제입니다(원인 미조사).

## 후속: 혜택 화면 초기 검색 누락 수정 (15:40~16:00 KST)

- 원인: `BenefitsClient`의 초기 effect가 시작하자마자 "초기화 완료" 플래그를 켜고 검색은 microtask 뒤로 미루며 cleanup에서 취소합니다. 개발 모드 React Strict Mode의 mount → cleanup → mount에서 첫 실행은 취소되고 두 번째 실행은 플래그 때문에 빠져나가 **첫 검색이 한 번도 나가지 않았습니다.** 혜택 화면 코드는 9/4 이후 그대로이며, Next 16.2.12 → 16.3.8 이후 개발 서버(E2E)에서 드러났습니다.
- 측정: 임시 probe(격리 사본 전용)로 `/benefits` 진입 후 10초간 검색 요청 수정 전 **0회**, 수정 후 **1회**. 실행 중인 production 앱은 Strict Mode 이중 실행이 없어 초기 검색이 정상(10,958건)이었으므로 실제 사용자 화면 영향은 없었습니다.
- 수정: 플래그를 첫 검색이 실제로 시작될 때만 켜도록 옮겼습니다(`src/components/BenefitsClient.tsx`). 같은 플래그를 쓰는 `SubscriptionClient`는 즉시 동기 실행이라 영향이 없어 바꾸지 않았습니다.
- 검증: `error-state-retry`·`gov24-request-lifecycle` E2E 17 통과 / 1 skip(인증 필요 조건 전용), `benefits-latest-action` 단위 3 통과, lint·전체 `tsc` 통과.

## 후속: DART 인덱스 누락 E2E 기대값 정리 (16:00~16:10 KST)

- PR #301 CI `dart_index_missing`의 `dart-missing-index.spec.ts` › "invest companies hides missing-index ops commands"가 30초 재시도 후 실패했습니다.
- 원인: 10/07 `37d26329`에서 `SearchPill` 지우기 버튼의 접근성 이름이 `Clear search` → `검색어 지우기`로 바뀌었는데 테스트가 옛 이름을 찾았습니다. 화면 결함이 아닌 테스트 기대값 불일치입니다. 옛 이름 참조는 이 1곳뿐이었습니다.
- 수정: 테스트가 `검색어 지우기` 버튼을 찾도록 변경(`tests/e2e/dart-missing-index.spec.ts`).
- 검증(CI `dart_index_missing`과 같은 env, 인덱스 파일 삭제 조건): 수정 전 1 실패 재현, 수정 후 2 통과.
