# 2026-08-26 전체 프로젝트 하드닝 최종 통합 마감

## 변경 파일

- 사용자 백업: `src/app/api/ops/backup/**`, `src/app/api/settings/backup/**`, `src/lib/ops/backup/**`, `src/components/OpsBackupClient.tsx`, `src/components/RecoveryClient.tsx`, `middleware.ts`
- desktop-local 실행: `scripts/planning_v2_desktop_launch.mjs`, `scripts/planning_v2_desktop_smoke.mjs`, `scripts/planning_desktop_session_server.mjs`, `scripts/planning_writer_child.mjs`, `src/lib/planning/deployment/**`
- Planning v3 lifecycle: `src/lib/planning/v3/service/batchLifecycleMutation.ts`, `src/lib/planning/v3/service/batchReadRepository.ts`, `src/lib/planning/v3/store/batchLifecycleLock.ts`, sidecar repository/store 및 관련 API route
- 공개 UI: `src/lib/navigation/publicMetadata.ts`, 공개 page/layout, `src/components/ui/Button.tsx`, 인증 필요 상태와 live region을 사용하는 client component
- 계약·회귀 테스트: `tests/planning/ops/**`, `tests/planning/deployment/**`, `tests/planning-v3-*.test.ts`, `tests/app-metadata-contract.test.ts`, `tests/public-ui-accessibility-contract.test.tsx`
- 운영 문서: `README.md`, `docs/planning-owner-backup-contract.md`, `docs/planning-v2-desktop-local.md`, `docs/planning-v3-boundary-adr.md`, `docs/current-screens.md`, 자동 생성 품질·최신성 보고서

## 사용 skill

- `finance-skill-routing`: 전체 변경에서 필요한 최소 로컬 skill 조합을 선택했다.
- `planning-gate-selector`: route, 저장소, desktop runtime, UI 변경에 맞는 focused·전체 검증 세트를 정했다.
- `route-ssot-check`: 공개 링크, production-hidden route와 `docs/current-screens.md` 계약을 대조했다.
- `planning-v3-batch-contract-narrowing`: stored-first 소유권, synthetic stored-only 읽기 전용, 명시적 삭제 예외를 보존했다.
- `work-log-closeout`: 실제 변경과 실행한 검증, 잔여 위험을 표준 형식으로 마감했다.

## 변경 이유

- production 사용자 백업이 인증 전에 큰 요청 본문을 읽거나, 일부 manifest 불일치와 delta checkpoint 순서 때문에 잘못된 성공 상태를 만들 수 있었다.
- 공개 안정 화면의 제목, 링크형 버튼, 비동기 상태 안내가 페이지마다 달라 비전문가와 보조기기 사용자가 현재 위치와 결과를 일관되게 이해하기 어려웠다.
- 배치 삭제와 sidecar 갱신이 겹칠 때 삭제 후 고아 파일 또는 rollback 뒤 최신 쓰기 유실 가능성이 있었고, synthetic stored-only 배치에 쓰기 허용 여부가 명시적이지 않았다.
- desktop secondary launcher가 session cookie를 복구할 수 없었고, 강제 종료 직후 writer ownership을 먼저 해제하거나 일회성 bootstrap bearer URL을 로그에 노출할 가능성이 있었다.

## 핵심 변경

- 백업 route는 local/origin/auth를 본문 파싱 전에 확인하고 multipart 크기를 제한한다. 암호화가 끝난 뒤에만 사용자별 delta checkpoint를 갱신하며, replace restore는 exact manifest와 13개 현재 사용자 Planning v3 owner를 검증하고 실패 시 함께 rollback한다.
- 34개 public-stable 화면의 metadata 소유권을 registry로 고정하고, 동적 상품 상세 제목을 추가했다. 중첩 `<Link><Button>`을 제거하고 live region·alert 계약을 정적 테스트로 고정했다.
- batch lifecycle lock을 batch 저장·삭제·sidecar 쓰기의 공통 최상위 순서로 적용했다. 성공 삭제 뒤 대기 중이던 쓰기는 404로 닫고, 실패 rollback 뒤의 최신 쓰기는 보존한다. synthetic stored-only는 조회와 명시적 삭제만 허용하고 sidecar 쓰기는 쉬운 400 안내로 차단한다.
- desktop process-lifetime loopback broker가 bounded·expiring one-shot nonce를 재발급한다. secondary launcher는 primary 준비를 기다린 뒤 fail-closed로 복구하고, `--no-open`은 bearer URL을 출력하지 않는다. 자동화 전용 전달 파일과 lock은 owner-only·atomic replace를 사용한다.
- 종료 시 child IPC shutdown을 먼저 요청하고 Windows에서는 PID tree를 강제 종료한 뒤 실제 registered child 종료를 확인해야 writer lease와 instance lock을 해제하도록 변경했다. runtime 등록 실패도 child 종료 확인 전 호출자에게 반환하지 않으며, Windows에서 직접 runtime이 먼저 종료돼 descendant 정리를 증명할 수 없으면 bootstrap과 lease를 fail-closed로 유지한다. 관련 운영 문서와 보안·route registry를 함께 갱신했다.

## 검증

- `corepack pnpm exec vitest run tests/planning-v3-batch-lifecycle-mutation.test.ts tests/planning-v3-storage-error-api.test.ts tests/planning/deployment/planningDesktopSessionServer.test.ts tests/planning/deployment/planningWriterLease.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts`: PASS, 5개 파일 / 66개 테스트
- desktop 종료·writer 등록 실패 focused 회귀 테스트: PASS, 3개 파일 / 26개 테스트 통과 / 네이티브 Windows 전용 1개 조건부 제외
- `corepack pnpm exec vitest run tests/planning/deployment/planningWriterLease.test.ts`: PASS, 14개 테스트 통과 / 네이티브 Windows 전용 1개 조건부 제외
- `corepack pnpm exec tsc --noEmit`: PASS
- `corepack pnpm lint`: PASS
- `corepack pnpm planning:auth:check`: PASS, 13개 파일 / 92개 테스트
- `corepack pnpm planning:user-scope:check`: PASS, 15개 파일 / 91개 테스트
- `corepack pnpm sec:scan:routes`: PASS, mutation method 130개 전부 분류
- `corepack pnpm planning:current-screens:guard`: PASS, 5개 파일 / 11개 테스트
- `corepack pnpm planning:ssot:check`: PASS, SSOT guard 및 5개 파일 / 11개 테스트
- `corepack pnpm planning:v2:desktop:smoke`: PASS, bootstrap session·secondary 복구·잘못된 IPC 종료 토큰 거부·profile/run/report/export·인증된 `E2E_IPC` 정상 종료와 writer child 정리 확인. `DEV_ACTION_TOKEN` 미설정으로 ops doctor 호출만 조건부 제외
- `corepack pnpm planning:v2:prod:smoke`: PASS, 공개 route·standalone asset·data-source read-only·remote probe 404 확인
- `corepack pnpm e2e:rc`: PASS, 46개 통과 / 개발 runtime 조건부 제외 2개
- `PLANNING_E2E_DISABLE_AUTH_HEADER=1 PLANNING_AUTH_REQUIRED=1 PLAYWRIGHT_REUSE_EXISTING_SERVER=0 corepack pnpm e2e:pw tests/e2e/error-state-retry.spec.ts --grep=planning.*unauthenticated --workers=1 --reporter=line`: PASS, 1개
- `PLAYWRIGHT_REUSE_EXISTING_SERVER=0 node scripts/playwright_with_webserver_debug.mjs --runtime=production --port=3182 test tests/e2e/smoke.spec.ts --grep=production.*hides.*dev --workers=1 --reporter=line`: PASS, 1개
- `corepack pnpm build`: PASS, TypeScript 및 252개 정적 페이지 생성 완료
- `corepack pnpm verify`: PASS, dump/schema/freshness/DART/security/lint/typecheck 및 869개 파일 / 3,367개 테스트 통과 / 네이티브 Windows 전용 1개 조건부 제외
- bootstrap URL 로그 정적 검색: 실제 출력 코드 발견 없음. 남은 문자열은 smoke/test의 비노출 assertion과 broker 내부 반환값뿐
- 검증 종료 후 관련 Next/Playwright/desktop process와 포트 `3100`, `3126`, `3158`, `3166`, `3182`, `3210` 잔존 없음
- `git diff --check`: PASS

## 남은 리스크

- 실제 Windows 설치 패키지에서 `taskkill /T`, owner ACL, mapped/network drive 차단을 확인하는 현장 smoke는 남아 있다. runtime이 등록 전에 먼저 종료되고 descendant가 남는 회귀 테스트도 네이티브 Windows 전용이라 이번 WSL/Linux 검증에서는 1개가 조건부 제외됐다. Linux 자동화는 broker protocol, PID 수명주기, fail-closed와 로그 비노출까지 검증했다.
- batch lifecycle lock은 지원하는 단일 writer process 안에서의 직렬화 계약이다. 여러 Node 인스턴스가 같은 저장소에 직접 쓰는 배포에는 파일시스템 lock 또는 DB transaction이 추가로 필요하다.
- 실제 로그인 계정과 실데이터의 백업 다운로드→preview→restore 수동 왕복은 수행하지 않았다. 현재 사용자 격리, exact manifest, 암호화, 13개 v3 owner, rollback과 대용량 경계는 자동 테스트로 검증했다.
- `docs/data-freshness-report.md` 기준 로컬 snapshot 8개는 모두 stale이다. 자격 증명이 있는 실제 DART·ECOS·공공데이터 호출은 이번 로컬 라운드 범위 밖이며, 누락·지연·부분 실패 시 UI가 유지되는 fallback 계약까지만 검증했다.
- test-only bootstrap 전달 파일도 짧은 수명의 bearer이므로 owner-only control root 밖으로 내보내면 안 된다. 현재 구현은 고엔트로피 테스트 token, control-root 경로 제한, `0600`, 소비 후 삭제로 범위를 제한한다.
