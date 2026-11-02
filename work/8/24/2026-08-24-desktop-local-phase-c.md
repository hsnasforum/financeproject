# Desktop Local Phase C 단일 사용자·단일 writer 운영 경계 완성

- 작업일: 2026-08-24
- 선행 기록: `work/8/24/2026-08-24-core-ux-data-hardening.md`
- 목표: 개인용 재무설계 앱의 지원 운영 형태를 desktop-local 한 가지로 좁히고, loopback 세션 인증과 앱 제어 루트 단위 writer lease로 로컬 저장 데이터의 사용자·프로세스 경계를 닫는다.

## 변경 전 정리

1. 수정 대상 파일: deployment policy/session/runtime root/writer lease 모듈, desktop launcher와 production startup, 공식 쓰기 스크립트, middleware/current-user 경계, Playwright·smoke·운영 문서와 관련 테스트.
2. 변경 이유: 기존 launcher lock은 앱 인스턴스만 제한하고 별도 CLI·스케줄러·실제 Next 자식 프로세스를 하나의 writer 소유권으로 묶지 못했으며, 로컬 production 진입도 브라우저 세션 수명주기를 명시적으로 증명하지 못했다.
3. 실행할 검증 명령: deployment 집중 Vitest, 인증·사용자 범위·보안 route 검사, desktop/prod smoke, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e:rc`, planning complete/compat와 release verification.

## 이번 라운드 완료 항목

1. 지원 모드를 `desktop-local`로 고정하고 loopback bind, 단일 사용자, 로컬 filesystem, SQLite, 앱 프로세스 1개라는 실행 정책을 코드와 문서에서 일치시켰다.
2. launcher가 고엔트로피 일회성 bootstrap URL을 만들고 `HttpOnly; SameSite=Strict` desktop session cookie로 교환하도록 구현했으며, 임의 사용자·외부 proxy identity header는 신뢰하지 않는다.
3. canonical app control root에 cross-process writer lease와 writer registry를 두고 실제 Next 자식, 공식 mutating CLI, 스케줄러를 하나의 소유권 아래 직렬화했다.
4. lease 복구는 같은 host의 등록 PID가 모두 종료됐고 파일 inode·payload가 그대로일 때만 허용하며, 손상 payload·외부 host·생존 여부 미확인은 fail-closed로 처리한다.
5. Windows bootstrap의 `SIGINT`/`SIGTERM`/parent disconnect를 실제 runtime까지 전달하고, launcher 종료 시 전체 등록 프로세스 종료와 lease 제거를 smoke로 확인했다.

## 주요 변경 파일

- `src/lib/planning/deployment/runtimePolicy.mjs`, `desktopSession.mjs`, `runtimeRoot.mjs`
- `src/lib/planning/deployment/writerLease.mjs`, `writerRegistry.mjs`와 타입 선언
- `scripts/planning_v2_desktop_launch.mjs`, `planning_desktop_session_server.mjs`, `next_prod_safe.mjs`
- `scripts/planning_writer_entry.mjs`, `planning_writer_child.mjs`, `planning_runtime_startup.mjs`
- `middleware.ts`, `src/lib/planning/auth/currentUser.ts`, `src/lib/planning/server/runtime/dataDir.ts`
- `package.json`, `scripts/planning_v2_ops_scheduler.sh`, `playwright.config.ts`, `scripts/playwright_with_webserver_debug.mjs`
- `docs/adr/0001-planning-deployment-modes.md`, `docs/planning-v2-desktop-local.md`, `docs/deploy.md`, `docs/runtime.md`
- `tests/planning/deployment/**`, `tests/middleware-security.test.ts`, `tests/planning/auth/currentUser.test.ts`, 관련 smoke·운영 계약 테스트

## 사용 skill

- `finance-skill-routing`: 이번 라운드의 최소 로컬 skill 조합을 선택했다.
- `planning-gate-selector`: deployment, 인증, route, startup, E2E 변경에 필요한 최종 검증 세트를 정했다.
- `work-log-closeout`: 변경 파일, 실제 검증, 잔여 위험과 다음 우선순위를 이 기록으로 마감한다.

## 검증 결과

- deployment 집중 Vitest: PASS, 7개 파일 / 105개 테스트
- TypeScript `tsc --noEmit --incremental false`: PASS
- 변경 파일 ESLint: PASS
- `corepack pnpm lint`: PASS
- `corepack pnpm test`: PASS, 859개 파일 / 3,284개 테스트. 1차 실행에서 발견한 구형 package-script 문자열 계약 1건은 writer 래퍼 계약으로 갱신 후 전체 재검증했다.
- `corepack pnpm build`: PASS, TypeScript 및 247개 페이지 생성 완료
- `corepack pnpm e2e:rc`: PASS, 46개 통과 / 2개 조건부 제외
- `corepack pnpm planning:v2:e2e:fast`: PASS, 8개 통과. 제거된 개발자 JSON·운영 링크를 기대하던 구형 E2E 계약을 현재 공개 UX 계약으로 갱신했다.
- planning full E2E: PASS, 10개 통과
- desktop production smoke: PASS, profile/run/report/export와 등록 자식 프로세스 종료·writer lease 제거 확인
- production smoke: PASS, `/public/dart`, 정적 asset, data-source 상태와 remote probe 확인
- production Playwright planning 진입: PASS, desktop session cookie 경계 사용
- 인증 검사: PASS, 13개 파일 / 89개 테스트
- 사용자 범위 검사: PASS, 15개 파일 / 88개 테스트
- 보안 route scan: PASS, 126개 mutation route 분류
- `corepack pnpm release:verify`: PASS
  - dependency audit: 662개 package / 687개 version, advisory 0건
  - planning complete/compat와 계산 regression 9개 시나리오 PASS
  - PostgreSQL readiness dry-run과 schema 검사 PASS
  - production release E2E: 8개 통과
  - route SSOT: 5개 파일 / 11개 테스트 PASS
- 신규 runtime `.mjs` `node --check`와 scheduler `bash -n`: PASS
- `git diff --check`: PASS
- 세션 토큰 할당 패턴 검사: 실제 토큰 없음, lease capability prefix 상수만 확인
- 종료 상태: 관련 launcher/Next/Playwright 프로세스와 `.data/runtime` lease 디렉터리 없음

## 남은 리스크와 엣지케이스

- 실행 중인 기존 instance에서 브라우저 cookie만 삭제하면 새 bootstrap을 발급하는 IPC가 없다. 현재는 앱을 종료하고 launcher를 다시 실행하는 복구 절차를 문서화했다.
- OS PID 재사용 가능성과 장기 실행 중 종료된 child PID가 lease 기록에 남는 문제는 완전히 제거하지 못했다. stale 회수는 host·생존 확인·inode/payload CAS를 함께 요구해 오회수 범위를 줄였다.
- 실제 Windows 설치 패키지 환경에서의 종료 신호와 mapped/network drive 차단은 이번 Linux 검증 환경에서 현장 확인하지 못했다. 자식 신호 전달 테스트와 filesystem type 단위 테스트로 계약을 검증했다.
- 저장 데이터 전체의 at-rest encryption은 이번 범위가 아니다. 지원 경계는 loopback 전용 개인 PC이며 remote/shared/web server와 network filesystem은 명시적으로 지원하지 않는다.
- 외부 DART·공공데이터 자격 증명이 있는 실제 운영 호출의 최신성은 별도 현장 확인 대상이다. 외부 소스가 없거나 부분 실패해도 핵심 UI와 안내가 유지되는 경계까지만 검증했다.

## 다음 라운드 우선순위

1. 실제 Windows 배포물에서 launcher 종료, 재시작, cookie 재발급, mapped drive 차단을 설치형 smoke로 확인한다.
2. 장기 실행 lease의 종료 child PID 정리와 PID reuse 방어를 보강할지 운영 관측 결과로 결정한다.
3. 로그인·외부 데이터 자격 증명이 구성된 실제 사용자 환경에서 planning 생성부터 보고서 저장까지 현장 smoke를 수행한다.
