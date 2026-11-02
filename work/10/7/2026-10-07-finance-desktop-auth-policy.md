# 2026-10-07 Finance Desktop Local 인증 정책 분리

## 변경 파일

- `src/app/api/auth/[...nextauth]/route.ts`, `src/lib/auth/routeHandlers.ts`: desktop 복구와 기존 웹 Auth.js 프로토콜 위임 경계.
- `src/lib/planning/auth/currentUser.ts`, `src/components/planning/PlanningAuthRequiredState.tsx`: desktop 오류의 복구 안내 구분.
- `scripts/security_route_registry.mjs`: 실제 POST Auth protocol과 반환형 provider 등록.
- `tests/planning/auth/{currentUser,currentUserAuthSession,authConfigContract,desktopAuthRoute,desktopRecovery}.test.ts`, `tests/security-route-capability-matrix.test.mjs`, `tests/e2e/planning-desktop-auth.spec.ts`.
- `docs/current-screens.md`, `docs/planning-v2-desktop-local.md`, `docs/adr/0001-planning-deployment-modes.md`, `FINANCE_ACTIVE_GOAL.md`, 이 기록.
- 저장소 밖 `/home/xpdlqj/finance-recovery/desktop-auth-20261007`: 격리 build 사본, `artifact-verified`, 공식 `installed`, 독립 DB/Planning root, 실행 wrapper와 안내, 재현·검증 근거.

## 사용 skill

- finance-skill-routing: 인증 수정에 필요한 최소 workflow 선택.
- planning-gate-selector: 인증·저장 경계의 focused 검사와 실제 설치본 milestone 검증 선택.
- route-ssot-check: Auth route 의미와 화면 안내의 inventory/계약 확인.
- work-log-closeout: 이번 수정·실행·잔여 범위를 한 기록으로 통합.

## 변경 이유

사용자가 desktop-local standalone production에서 외부 OAuth 없이 `/dashboard`, `/planning`에 진입하고, 일반 production 인증은 유지하도록 요청했다. `AGENTS.md`, 현재 목표, 실제 launcher/env/Auth.js/currentUser/middleware/runtime policy와 관련 테스트를 먼저 확인했다.

기존 정상 launcher bootstrap은 이미 `default` 사용자를 인증했다. 반면 세션이 없는 Planning 화면은 웹 로그인 링크를 표시하고 `/api/auth/signin`은 Auth.js에 도달했다. 무설정 baseline에서 `UntrustedHost`를 재현했다. 단순 single-user flag나 Auth.js secret 추가로 해결할 문제가 아니었다.

## 핵심 변경

- 수정 전: 세션 없는 desktop → 공통 로그인 안내 → Auth.js 로그인. 수정 후: desktop 전용 복구 안내 → 공식 launcher의 one-shot 세션 → `default` 사용자. 이전 signin 주소는 검증된 local runtime에서 `/planning`으로 이동할 뿐 쿠키나 권한을 발급하지 않는다.
- desktop는 runtime attestation, 단일 writer/local root/SQLite, 정확한 loopback host, raw/forwarded header 제한과 유효한 process session cookie를 계속 요구한다. 세션이 없을 때 익명 fallback을 만들지 않았다. provider·고정 secret·trustHost 설정과 production 인증 비활성화도 추가하지 않았다.
- 일반 웹에서는 원래 Request/body와 Auth.js Response를 그대로 전달한다. production은 `PLANNING_AUTH_REQUIRED=false`여도 인증을 요구한다. trusted header의 명시적 활성화·로컬 제한·위조 거부가 Auth.js session보다 우선하며, single-user 설정은 저장 identity 정규화일 뿐 인증 근거가 아니다.
- 실제 standalone manifest의 middleware 목록이 비어 있어 루트 middleware에 둔 중간 시안은 실행되지 않았다. 실제 App Router Auth route에 경계를 두고, 이번 middleware/test 변경만 시작 hash와 일치하도록 제거했다. 기존 사용자 변경은 보존했다.
- 명시적 POST wrapper가 보안 스캐너에 새로 발견되므로 exact route를 등록했다. static web adapter의 반환을 `originCsrf` 증거로 인정하며 Auth.js CSRF/state/PKCE 검증을 그대로 사용한다. 반환을 버리는 음성 사례를 검사한다. 스캐너·Auth.js config 자체를 완화하지 않았다.
- Sol Max에 독립 조사와 수정 후 검토를 맡겼다. 메인은 모든 수정·build·installer·DB·port·browser·최종 검증을 소유했다. 최종 정적 검토에서 추가 구체적 결함은 발견되지 않았다.

## 검증

- 환경: WSL Ubuntu, Linux Git, Node 22.23.2, Corepack pnpm 9.15.9. engines 22.22.2 경고는 유지했다. 시작 branch `main`, HEAD `6a51f8d3a24394ba239838a78c8c19aa590fc180`, 기존 dirty status 543항목을 기준으로 이번 delta를 분리했다.
- 재현: 기존 패키지를 별도 경로에 설치하여 동일한 fresh-browser 검사를 실행했다. 복구/OAuth 경계 2개 실패, 정상 bootstrap 1개 통과. 중간 middleware 시안 역시 standalone 미등록으로 경계 검사가 실패해 실제 route로 수정했다. 잘못된 Host 포트의 URL 예외도 좁게 재현 후 403으로 처리했다.
- `corepack pnpm planning:auth:check -- --maxWorkers=2`: 13files/100tests PASS. runner의 문자열 glob만으로 auth 디렉터리 전체를 확인했다고 간주하지 않았다.
- `corepack pnpm exec vitest run tests/planning/auth/*.test.ts tests/middleware-security.test.ts --maxWorkers=2`: 16files/177tests PASS. adapter 추가 후 영향받는 `desktopAuthRoute` 11개와 `authConfigContract` 10개를 다시 실행해 PASS. 그 외 소스가 같은 결과는 재사용했다.
- `corepack pnpm planning:user-scope:check`: 15files/94tests PASS. `default` storage scope, production 인증 및 multi-user 회귀를 확인했다.
- `corepack pnpm exec vitest run tests/security-route-capability-matrix.test.mjs`: 40tests PASS. Auth.js 응답을 버리면 `missing originCsrf`를 검출한다.
- `corepack pnpm sec:check`: PASS, mutation 133/133 classified. `corepack pnpm planning:ssot:check`: guard 및 5files/11tests PASS. 변경 TS/TSX/MJS의 scoped ESLint PASS.
- 격리 candidate에서 `corepack pnpm build`: 최종 PASS. 실제 코드가 바뀐 경우에만 build를 다시 했으며 중간 결과를 최종 결과로 사용하지 않았다.
- `corepack pnpm planning:v2:desktop:build -- --no-next-build --artifact-dir=/home/xpdlqj/finance-recovery/desktop-auth-20261007/artifact-verified`: PASS. 바로 앞의 최종 build만 패키징했다. SHA 조회는 원본 Git을 읽기 전용으로 참조했다.
- `node scripts/planning_v2_desktop_verify.mjs --mode=pristine-install`, `node scripts/planning_v2_desktop_install.mjs --self-contained-source --from=<artifact-verified> --to=<새 installed> --skip-install --skip-shortcuts`, 설치본 `--mode=runtime`: PASS. 40,934파일 검사. 새 설치 DB만 공식 installer의 Prisma 경계에서 준비했으며 실제 사용자 DB는 사용하지 않았다.
- 정상 packaged launcher를 production/standalone, loopback 3391에서 실행했다. 서버에 OAuth/secret/E2E token override를 주지 않았다. `python3 <새 검토본>/check-packaged-auth.py verified <installed> <review-state> 3391`가 `corepack pnpm e2e:pw tests/e2e/planning-desktop-auth.spec.ts --runtime=production --workers=1 --retries=0`를 외부 앱에 연결했다: **3 PASS**.
- 두 개의 fresh browser context에서 사전 cookie/header 주입 없이 broker의 one-shot URL을 소비했다. HttpOnly/Strict cookie, `/dashboard`·`/planning`, reload, API의 `default`/`desktop-local-session`, nonce 재사용 403을 확인했다. 세션 없는 화면과 이전 signin 주소의 복구, 다른 Auth endpoint 404도 확인했다. Desktop 1440px와 작은 화면 390px 캡처를 직접 열어 확인했다.
- 위 정상 runtime 로그에서 `UntrustedHost=0`, `MissingSecret=0`. 브라우저 결과와 서버 시작은 각각 `verified-result.json`, `verified-browser.log`, `verified-server.log`에 남겼다. nonce/token을 결과나 trace에 기록하지 않았다.
- 최초 dashboard 캡처가 갱신 중 상태여서 hydration 이전 버튼 확인 대신 보조 정보 로딩 완료 assertion과 작은 화면 viewport 캡처를 추가했다. 같은 설치본의 최종 `check-packaged-auth.py acceptance ...`: **3 PASS, 14.5초**, 두 Auth.js 오류 모두 0건. 최종 dashboard·mobile 캡처도 직접 확인했다. 제품 코드는 동일하므로 build/smoke를 반복하지 않았다.
- `node scripts/planning_v2_desktop_smoke.mjs --app-dir=<새 installed> --port=3392 --timeout-ms=90000`: PASS. 별도 fixture DB/root에서 bootstrap 재발급·인증·profile/run/report/export·production-hidden 경계를 확인했다.
- 원본→candidate→artifact→installed의 제품 파일 hash와 standalone BUILD_ID 일치, 설치 env의 Auth.js 관련 key 부재를 `evidence/artifact-source-match.json`으로 확인했다. 기존 목표 보존 소스와 그 이전 저장·재열기 검증은 변경되지 않은 범위에서 재사용했다.
- `corepack pnpm worktree:scope -- <이번 변경 17파일>` 및 scoped `git diff --check`: PASS. 시작 4,478파일 기준 예상 밖 변경 0개, 실제 DB/설정과 이전 설치 manifest를 포함한 보호 파일 5개 hash·HEAD·index 일치. 기존 dirty 변경을 보존했다. 근거는 `evidence/preservation.json`이다. stage·commit·push·배포는 하지 않았다.

## 미실행 검증

Windows 기본 브라우저 자동 열기·Windows 네이티브 설치, 실제 OAuth 계정 로그인, live 외부 API, 전체 RC/release gate는 수행하지 않았다. 브라우저 성공 근거는 WSL Chromium이다. 기존 목표 저장/삭제 전체 E2E를 반복하지 않았으며 새 smoke 저장 경계와 기존 유효한 목표 검증을 구분한다.

## 남은 리스크

- 검증용 새 데이터 공간의 대시보드에는 일부 보조 정보 미확인 안내가 표시됐다. 핵심 재무 화면과 인증 진입은 성공했으며, 외부 데이터 연결의 정상 동기화는 이번 검증 범위가 아니다.
- 현재 root `middleware.ts`가 standalone 빌드에 포함되지 않는 기존 상태는 별도 FOLLOW-UP이다. 이번 Auth route와 사용자별 page/API 인증은 실제 경로에서 검증했으며, 전체 middleware를 활성화하는 광범위한 변경을 하지 않았다.
- 새 시작 명령은 공식 launcher와 기존 WSL→Windows browser 연결 방식을 사용한다. Windows 자동 열기 자체는 위 미검증 범위다. 주소창에 일반 `/planning`만 입력하는 것은 one-shot session 전달을 대신하지 않는다.
- 설치 manifest의 Git SHA는 기반 commit이다. 전체 미커밋 소스를 대표하는 release ID로 표시하지 않는다. 기존 설치본을 덮어쓰지 않았으므로 새 검토본에서 확인해야 한다.

## 다음 라운드

실행: `wsl -d Ubuntu -- bash /home/xpdlqj/finance-recovery/desktop-auth-20261007/start-review.sh`. 대시보드 → 재무 진단을 확인하고, 세션 안내가 나오면 같은 시작 명령으로 브라우저를 다시 연다. 추가 제품 변경이나 게시는 이번 범위에 포함하지 않는다.
