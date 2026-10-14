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

## 후속: E2E 비인증 복구 단계 정리 (16:10~16:25 KST)

- PR #301 CI `core_flows`의 "Run unauthenticated error recovery" 단계에서 2건이 실패했습니다(`main`에도 있는 단계).
- 원인 1: workflow 명령 `pnpm e2e -- … --grep "planning reports keeps"`에서 pnpm이 `--`를 넘겨 Playwright가 `--grep`을 파일 필터로 해석했고, 1개 대신 5개 테스트가 실행되었습니다. 그중 인증 세션이 필요한 `/planning` 손상 프로필 테스트가 로그인 필수 환경의 로그인 안내 화면에서 실패했습니다.
- 원인 2: 개발 모드 Strict Mode에서 리포트 화면이 실행 기록을 2번 요청하고 첫 요청을 abort합니다(측정: 2회, 첫 요청 `ERR_ABORTED`). 테스트가 요청 순서(첫 401, 둘째 200)로 응답해 abort된 요청이 401을 소비했습니다. 모든 요청이 401일 때 로그인 안내 알림은 정상 표시되어 화면 결함은 아닙니다.
- 수정: workflow 해당 단계에서 `--` 제거, 손상 프로필 테스트는 로그인 필수 구성에서 skip, 리포트 테스트는 "다시 시도" 클릭 전 401·후 200으로 응답(기존 검사 유지).
- 검증(격리 사본, CI env): 새 단계 명령은 1개만 실행·통과, 로그인 필수 환경 전체 spec 4 통과/1 skip, 일반 환경 전체 spec 4 통과/1 skip, workflow 계약 테스트·lint 통과.

## 후속: windows_native 데스크톱 세션 서버 테스트 원인 (16:30~16:45 KST)

- PR #301 CI `windows_native`는 10/07 job 추가 이후 이 브랜치의 모든 실행에서 7단계 "Windows writer and process-tree contracts"에서 같은 2건(`planningDesktopSessionServer.test.ts`의 보조 런처 테스트)으로 실패했습니다. 8~9단계(데스크톱 빌드·설치, Windows production·desktop smoke)는 한 번도 실행되지 않았습니다.
- 원인: 런처의 `publishAutomationBootstrapUrl`이 `realpath`로 정규화된 control root와, 정규화하지 않은 `PLANNING_E2E_DESKTOP_BOOTSTRAP_FILE` 경로를 글자 단위로 비교했습니다. 테스트와 desktop smoke는 `os.tmpdir()` 아래 경로를 넘기는데, Windows runner의 임시 경로가 8.3 짧은 이름(`RUNNER~1`)이면 realpath(`runneradmin`)와 달라져 "control root 밖"으로 판정됩니다. 짧은 이름 자체는 CI 로그에 직접 찍히지 않아 추정이며, Linux에서 `TMPDIR`을 symlink로 거치게 하면 같은 2건이 같은 메시지로 재현됩니다.
- 수정: 비교 전에 출력 경로도 기존 헬퍼 `resolveProspectiveDesktopCanonicalPath`로 정규화합니다(`scripts/planning_v2_desktop_launch.mjs`). control root 밖 경로 거부는 그대로이며, 링크로 control root 밖을 가리키는 경로도 이제 정규화 후 거부됩니다. 회귀 테스트 1건 추가(링크로 접근한 control root는 통과, 밖의 경로는 거부).
- 검증(격리 사본, 네트워크 차단): 새 테스트는 수정 전 런처에서 실패 재현, 수정 후 일반 `/tmp`·symlink `TMPDIR` 모두 10 통과. windows_native 7단계 묶음과 런처 관련 11파일 182 통과 / 4 skip, lint·전체 `tsc` 통과.
- 범위 밖: symlink `TMPDIR`에서 배포 suite 3파일 6건(`DATABASE_SYMLINK`, writer capability root 비교 등)이 실패하지만 수정 전 런처에서도 동일하며 Windows CI 대상 suite가 아닙니다. Windows 실기 실행은 하지 못했으므로 8~9단계 결과는 다음 CI에서 처음 확인됩니다.

## 후속: windows_native 설치본 서버 chunk 누락 원인 (17:15~17:45 KST)

- `55dcdccc` 이후 windows_native 7·8단계가 처음 통과했고, 9단계 desktop smoke에서 설치본 서버가 `Cannot find module './chunks/6555.js'`(`_not-found/page.js`가 요구)를 반복하다 종료했습니다.
- 원인: `runtimeRoot.mjs`의 `path.join(os.homedir(), "AppData", "Local")`(및 `.local/share`)를 Next 빌드 파일 추적(nft)이 빌드 시점에 계산해 홈 아래 전체를 추적합니다. nft·Next의 "추적 루트 밖" 필터는 상대 경로가 `..`로 시작하는지만 보므로, 프로젝트(D:)와 홈(C:)이 다른 Windows runner에서는 `C:\...`가 걸러지지 않았습니다. 빌드 경고 `Failed to copy traced files` 173건의 바깥 경로는 모두 `C:\Users\runneradmin\AppData\Local`(1건은 그 안 winget 별칭이 가리키는 `WindowsApps`)이었습니다. Next의 복사 루틴은 실패 시 동시 복사 슬롯을 반납하지 않고 "복사됨" 표시를 먼저 하므로, 실패가 쌓인 페이지의 나머지 파일과 같은 chunk를 공유하는 페이지까지 복사가 빠졌습니다.
- 수정: 홈 디렉터리를 작은 함수(`resolveUserHomeDirectory`)로 감싸 실행 시점에만 계산합니다(동작 동일). 회귀 테스트 1건(Next 내장 nft로 `runtimeRoot.mjs`를 추적해 임시 홈 아래 파일이 없어야 함) 추가.
- 검증(격리 사본, 네트워크 차단): 새 테스트는 수정 전 코드에서 홈 probe 2개가 추적되어 실패, 수정 후 통과. 실제 webpack build를 홈이 추적 루트 안에 있는 조건으로 비교하면 수정 전 page trace의 홈 파일 참조 346건·standalone에 홈 폴더 복사, 수정 후 0건·미복사(두 build 모두 성공, server chunk 107개 standalone 누락 0). 배포·provenance 17파일 229 통과 / 4 skip, lint·전체 `tsc` 통과.
- 남은 것: Windows 실기 결과는 다음 CI에서 확인합니다. 9단계의 production smoke DB 볼륨 문제와 저장소 확인 불안정은 별도 원인이라 이번 수정으로 해결되지 않습니다.

## 후속: `428f96a6` CI 결과와 Windows 테스트 제한 시간 (17:50~18:00 KST)

- PR 쪽 `windows_native`가 처음으로 9단계까지 통과했습니다. 빌드 경고 `Failed to copy traced files` 0건, `chunks/...` 오류 0건, 설치본 desktop smoke `PASS`로 chunk 누락 수정이 Windows에서 확인되었습니다.
- 단, 같은 9단계의 production smoke는 여전히 "same filesystem volume"으로 실패했는데 step이 성공으로 표시되었습니다. pwsh step은 앞 명령의 실패 종료 코드로 멈추지 않고 마지막 명령(desktop smoke)의 결과만 반영하기 때문입니다(미수정, 별도 과제).
- push 쪽 `windows_native`는 7단계에서 vitest 기본 제한 5초 초과 2건으로 실패했습니다. 실제 런처 프로세스를 두 번 띄우는 기존 테스트(직전 3.3초 → 5.02초, 같은 실행에서 다른 테스트도 약 2배 느림)와 이번에 추가한 nft 회귀 테스트(5.7초, 통과한 PR 쪽도 4.5초)입니다. 런처 프로세스 테스트 3건에 30초(보조 런처 1회당 10초 상한 ×2 기준), nft 테스트에 30초 제한을 명시했습니다. 검사 내용은 바꾸지 않았습니다.
- `dart_index_missing`은 `/invest/companies`의 `waitForLoadState("networkidle")`가 60초 동안 끝나지 않아 실패했습니다(재시도 포함 2회). 직전 두 CI와 격리 사본 3회 재실행에서는 모두 통과했고 이번 변경과 관련된 경로가 아니라 일시적 불안정으로 판단합니다(근본 원인 미확인).
- 검증(격리 사본): windows_native 7단계 묶음 2회 모두 32 중 30 통과 / 2 skip, lint·전체 `tsc` 통과.

## 후속: Windows 로컬 저장소 확인 실패 원인 (18:20~18:45 KST)

- `3fd5756f` CI에서 `windows_native`가 PR 쪽은 7단계(보조 런처 테스트), push 쪽은 8단계(설치 `verified local app control root`)에서 `planning=unknown, app=unknown, database=unknown`으로 실패했습니다. 지금까지 이 확인까지 간 Windows job 5개 중 3개에서 7·8·9단계 어디서나 나왔습니다.
- 원인: Windows의 Node `statfs`는 파일시스템 종류를 주지 않아(`type=0`, 이 PC에서 확인) `inspectPlanningDataRoot`가 매번 PowerShell로 드라이브 종류를 묻습니다. 런처는 3개 루트를 동시에, 런타임 시작 확인은 2개를 확인하므로 실행 한 번에 PowerShell이 최대 5번 뜨고 각 조회 제한이 5초였습니다. 실패한 CI 테스트는 5.2초, smoke는 5.45초 만에 실패해 시간 초과와 맞습니다.
- 재현(이 PC의 Windows Node, 기존 코드 그대로): 부하 없음 0.5초·모두 local, CPU 부하 시 5.1~6.0초에 3번 중 3번 1개 루트 unknown(PowerShell 3회).
- 수정(`runtimeRoot.mjs`): 같은 드라이브 조회는 프로세스 안에서 1회로 공유(실패·빈 응답은 보관하지 않음), 조회 제한 5초 → 30초. 확인 불가 시 거부하는 원칙은 그대로입니다. Windows 전용 회귀 테스트 1건(같은 드라이브의 루트 3개 동시 확인 → 모두 local, PowerShell 1회 이하).
- 검증: 같은 부하에서 수정 코드는 3번 모두 local·PowerShell 1회, 소요 6.9~8.5초(기존 5초 제한이었다면 실패). Linux 격리 사본에서 배포·provenance 17파일 229 통과 / 5 skip(Windows 전용 포함), lint·전체 `tsc` 통과. Windows 전용 테스트는 다음 CI의 windows_native 7단계에서 실행됩니다.
- 영향: CI뿐 아니라 느린 사용자 PC에서 데스크톱 앱이 간헐적으로 시작을 거부할 수 있었던 문제입니다.

## 후속: Windows production smoke DB 볼륨 문제 (18:45~19:00 KST)

- `98fad12c` CI에서 push 쪽 `windows_native`는 저장소 확인 실패 0건으로 통과했지만, 9단계 production smoke는 계속 `desktop-local SQLite database must be on the same filesystem volume as the app`으로 실패했습니다(마지막 명령인 desktop smoke 결과만 반영되어 가려짐).
- 원인: "같은 볼륨" 규칙은 의도된 제품 계약입니다(`planningSmokeDatabase.test.ts`가 다른 볼륨 거부를 고정, 런타임도 같은 규칙). production smoke는 테스트 DB를 `os.tmpdir()`(runner의 `C:\Users\RUNNER~1\...\Temp`)에 만들고, CI는 앱을 `RUNNER_TEMP`(D:)에 설치해 규칙에 걸렸습니다. 태그 릴리스 `release.yml`도 같은 구성(Windows, `RUNNER_TEMP` 설치 후 production smoke)이며 그쪽은 명령별 종료 코드를 검사하므로 다음 릴리스에서 실패할 상태였습니다.
- 수정: 제품 규칙과 smoke 스크립트는 그대로 두고, 두 workflow의 smoke step에 `TEMP`/`TMP: ${{ runner.temp }}`를 지정해 OS 임시 폴더를 설치 볼륨에 맞췄습니다. workflow 계약 테스트(`quality-gates-registry`, `release-workflow-contract`)에 이 설정 검사를 추가했습니다.
- 검증: 이 PC의 Windows Node에서 `TEMP=D:\a\_temp`이면 `os.tmpdir()`가 그 경로를 쓰고 앱 경로 기준 상대 경로가 `..\...`(같은 볼륨)임을 확인. 새 계약 검사는 수정 전 workflow에서 2건 실패, 수정 후 workflow 계약 테스트 3파일 57 통과, YAML 파싱으로 두 step의 env 확인, lint 통과.
- 남은 것: production smoke가 Windows에서 DB 준비 이후 단계까지 가는 것은 다음 CI가 처음입니다. 9단계 결과 가림(2번 과제)은 아직 그대로라 로그로 직접 확인해야 합니다.
- 함께 처리(2번 과제): `windows_native`의 6~9단계는 Windows 기본 셸인 pwsh로 실행되는데, pwsh는 실패한 명령에서 멈추지 않고 step 결과로 마지막 명령의 종료 코드만 남겨 앞 명령의 실패가 가려졌습니다(9단계의 production smoke 실패, 7단계 첫 vitest 실패 가능성 등). `release.yml`과 같은 방식으로 각 `pnpm` 명령 뒤에 `if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`를 넣고 6·7단계에 `shell: pwsh`를 명시했습니다. 계약 테스트에 "windows_native의 모든 `pnpm` 명령 다음 줄이 종료 코드 검사"를 추가했습니다.
- 추가 검증: 이 PC의 PowerShell로 GitHub pwsh step 형태를 재현해 기존 형태는 첫 명령 실패에도 종료 코드 0, 검사 추가 형태는 실패 코드로 끝남을 확인. 새 계약 검사는 HEAD `ci.yml`과 production smoke 뒤 검사 한 줄을 뺀 변형에서 각각 실패, 수정본에서 workflow 계약 테스트 57 통과, YAML 파싱으로 6~9단계 `pnpm` 9개 모두 검사 확인.

## 후속: `4ed1c29c` CI와 production smoke 정리 단계 EBUSY (19:40~20:00 KST)

- 결과: PR 쪽 `windows_native`가 종료 코드 검사가 들어간 상태로 통과했습니다. production smoke 7개 검사(`/public/dart`, standalone·public asset, 상품 DB 계약, `/products/catalog`, `/settings/data-sources`, 원격 probe 403)가 Windows에서 처음 모두 `PASS`, desktop smoke도 `PASS`. 저장소 확인 실패·복사 경고·chunk 오류 0건, 7단계 33 통과.
- push 쪽 `windows_native`는 production smoke가 `PASS`를 출력한 19ms 뒤 정리 단계에서 `EBUSY: resource busy or locked, unlink '...\planning-prod-smoke-...\database\finance.db'`로 실패했습니다(같은 코드에서 PR 쪽은 통과한 경합).
- 원인: production smoke는 Windows에서 런처를 `child.kill("SIGTERM")`으로 멈춥니다. Windows에서는 런처 프로세스만 즉시 강제 종료되고(그래서 19ms), 그 아래 Next 서버 프로세스 트리는 정상 종료 절차 없이 남아 SQLite 파일을 잠근 채 임시 폴더 삭제와 경합합니다. desktop smoke는 같은 런처를 IPC 종료 메시지(세션 토큰 확인)로 정상 종료하고 실패 시 `taskkill /T /F`로 트리를 정리하며, Windows CI에서 `shutdown signal=E2E_IPC (graceful)`로 문제없이 동작해 왔습니다.
- 수정: desktop smoke의 종료 함수(`stopServer`)를 export하고 production smoke가 IPC 채널로 런처를 띄워 같은 함수로 종료하게 했습니다(토큰은 이미 만드는 `PLANNING_E2E_DESKTOP_SESSION_TOKEN`을 사용). production smoke의 중복 종료 코드는 제거했습니다.
- 검증(격리 사본, 네트워크 차단): production smoke 2회 모두 7개 검사 `PASS`, 런처 `shutdown signal=E2E_IPC (graceful)`, 종료 코드 0, 임시 폴더 잔존 0. 관련 테스트 4파일 53 통과, lint 통과. Windows에서의 확인은 다음 CI입니다.
