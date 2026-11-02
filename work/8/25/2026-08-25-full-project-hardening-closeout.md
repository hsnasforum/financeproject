# 전체 프로젝트 분석 후 핵심 흐름 하드닝 종료 기록

- 작업일: 2026-08-25
- 선행 기록: `work/8/24/2026-08-24-core-ux-data-hardening.md`, `work/8/24/2026-08-24-desktop-local-phase-c.md`, `work/8/24/2026-08-24-production-backup-contract.md`, `work/8/24/2026-08-24-data-freshness-recovery.md`, `work/8/24/2026-08-24-delete-undo-integrity.md`
- 목표: 오래된 전체 코드와 사용자 흐름을 점검한 결과를 바탕으로 인증·저장 무결성·외부 데이터 최신성·백업·추천·모바일 UI의 우선 문제를 구현하고, 저장소 전체 게이트와 실제 브라우저에서 회귀를 확인한다.

## 변경 전 정리

1. 수정 대상 파일: desktop-local 실행 경계, 사용자 백업 API와 화면, Planning/Recommend 저장·표시 계약, DART·가정치·대시보드 복구 흐름, 공개 화면 메타데이터·모바일·접근성, 관련 문서와 테스트.
2. 변경 이유: production에서 개발 API를 참조하는 경로, 사용자 범위 누락, 삭제 후 잔존 데이터, 잘못된 최신성 판단, 외부 요청 지연 시 무한 대기, 점수 단위·비교 결과 불일치, 작은 화면의 사용성·접근성 공백을 해소하기 위해서다.
3. 실행할 검증 명령: focused Vitest, TypeScript, lint, route/auth/user-scope/SSOT/security 가드, Planning complete/compat/regression, 전체 test/build/E2E, production·desktop smoke, 실제 390px 브라우저 점검, diff-check.

## 이번 라운드 완료 항목

1. 지원 실행 형태를 loopback 전용 `desktop-local`로 고정하고, 일회성 bootstrap session과 app-control-root 단일 writer lease/registry로 Next 자식·공식 CLI·스케줄러의 쓰기 경계를 통합했다.
2. `/api/settings/backup/*`에 현재 사용자 범위의 암호화 export·preview·restore를 추가하고, production 백업·복구 화면에서 dev/ops 전용 기능과 임시 파일 의존을 제거했다.
3. Planning 프로필 누락값, 사용자별 피드백, 두 실행 비교 보고서와 Recommend 0~1 점수 표시를 실제 저장·응답 계약에 맞췄다.
4. 가정치 최신성은 경제 기준일 `asOf`로 판정하고 ECOS 부분 성공을 독립 보충하며, DART 인덱스의 누락·손상·오래됨·미확인을 분리했다. 대시보드 보조 요청에는 8초 제한과 부분 성공 복구를 적용했다.
5. Planning v3 배치 삭제가 동일 사용자 sidecar까지 정리하고 실패 시 스냅샷을 병합 복원하도록 보완했다. 추천 기록과 최근 결과 삭제에는 현재 사용자 범위의 1회 되돌리기를 추가했다.
6. 상품 탐색·백업·복구·추천 이력의 제목 메타데이터, 인증 필요 상태, 모바일 비교 요약, live region/alert, 링크형 버튼 구조를 정리했다. 390px 실브라우저에서 네 화면 모두 가로 넘침과 중첩 인터랙션이 없음을 확인했다.

## 주요 변경 파일

- 실행·인증: `src/lib/planning/deployment/**`, `scripts/planning_v2_desktop_launch.mjs`, `scripts/planning_runtime_startup.mjs`, `middleware.ts`, `src/lib/planning/auth/currentUser.ts`
- 백업·피드백·리포트: `src/app/api/settings/backup/**`, `src/components/OpsBackupClient.tsx`, `src/components/RecoveryClient.tsx`, `src/app/api/planning/v2/feedback/route.ts`, `src/lib/planning/server/reports/runReportRouteService.ts`
- 최신성·복구: `src/lib/planning/assumptions/**`, `src/lib/publicApis/dart/**`, `src/lib/dataSources/impactHealth.ts`, `src/components/DashboardClient.tsx`, `src/components/OpenDartStatusCard.tsx`
- 삭제 무결성: `src/lib/planning/v3/store/batchesStore.ts`, `src/lib/planning/v3/store/*OverridesStore.ts`, `src/lib/planning/v3/service/storedBatchCommandSurface.ts`, `src/components/RecommendHistoryClient.tsx`
- 공개 UI: `src/components/ui/Button.tsx`, `src/components/planning/PlanningAuthRequiredState.tsx`, `src/components/recommend/RecommendAuthRequiredState.tsx`, `src/lib/navigation/publicMetadata.ts`, `src/app/products/catalog/layout.tsx`
- 계약·회귀 테스트: `tests/planning/deployment/**`, `tests/planning/settings-backup-production-boundary.test.ts`, `tests/planning-v3-transactions-batches-user-scope.test.ts`, `tests/recommend-history-undo.test.tsx`, `tests/public-ui-accessibility-contract.test.tsx`, `tests/app-metadata-contract.test.ts`

## 사용 skill

- `finance-skill-routing`: 변경 범위별 최소 로컬 skill 조합을 선택했다.
- `planning-gate-selector`: 저장·route·UI·deployment 변경에 필요한 focused 및 전체 게이트를 정했다.
- `route-ssot-check`: 추가 API와 공개 링크·메타데이터를 실제 route SSOT와 대조했다.
- `dart-data-source-hardening`: DART·외부 가정치의 최신성, 부분 실패와 사용자 안내 계약을 점검했다.
- `planning-v3-batch-contract-narrowing`: stored-first, 사용자 소유권, legacy fallback과 sidecar 삭제 경계를 보존했다.
- `playwright`: 실제 Firefox 세션에서 390×844 공개 화면을 확인하고 검증 이미지를 `output/playwright/full-project-hardening/`에 저장했다.
- `work-log-closeout`: 변경·검증·잔여 위험을 이 문서로 통합 마감했다.

## 검증 결과

- focused UI·메타데이터·백업·추천·대시보드 테스트: PASS, 8개 파일 / 40개 테스트
- 실행 비교 보고서 테스트: PASS, 1개 파일 / 5개 테스트
- v3 저장소 회귀 수정 후 focused 테스트: PASS, 4개 파일 / 59개 테스트
- `corepack pnpm exec tsc --noEmit --incremental false`: PASS
- `corepack pnpm lint`: PASS
- `corepack pnpm test`: PASS, 865개 파일 / 3,324개 테스트
- `corepack pnpm build`: PASS, TypeScript 및 252개 정적 페이지 생성 완료
- `corepack pnpm e2e:rc`: PASS, 46개 통과 / 2개 조건부 제외
- `corepack pnpm planning:ssot:check`: PASS, 5개 파일 / 11개 테스트
- `corepack pnpm planning:auth:check`: PASS, 13개 파일 / 89개 테스트
- `corepack pnpm planning:user-scope:check`: PASS, 15개 파일 / 91개 테스트
- `corepack pnpm sec:scan:routes`: PASS, mutation route 130개 분류
- `corepack pnpm planning:v2:complete`: PASS, release E2E 8개 포함
- `corepack pnpm planning:v2:compat`: PASS, 호환 계약과 release E2E 8개 포함
- `corepack pnpm planning:v2:regress`: PASS, 계산 회귀 9개 시나리오와 full E2E 10개
- `corepack pnpm planning:v2:prod:smoke`: PASS, standalone route·정적/공개 asset·data-source·remote probe 경계 확인
- `corepack pnpm planning:v2:desktop:smoke`: PASS, production-only vault route 비노출과 launcher 수명주기 확인. `DEV_ACTION_TOKEN` 미설정으로 ops doctor 호출은 조건부 제외됐다.
- `corepack pnpm multi-agent:guard`: PASS
- Playwright 직접 확인: `/products/catalog`, `/settings/backup`, `/settings/recovery`, `/recommend/history`의 제목, 390px 가로 폭, 링크/버튼 중첩 0건, 콘솔 오류 0건 확인. 경고는 개발 모드 Pretendard preload/name-record 메시지뿐이었다.
- 추가된 debug marker와 대상 공개 화면의 중첩 인터랙션 정적 검색: 발견 없음
- `git diff --check`: PASS

## 남은 리스크와 엣지케이스

- 실제 로그인된 배포 계정과 실데이터로 백업 파일 다운로드→preview→restore 전체를 수동 실행하지는 않았다. current-user 경계와 API/화면 계약, production build·smoke는 자동 테스트로 확인했다.
- v3 sidecar 3종과 batch store는 각각의 write lock을 사용한다. 실패 복원은 제공하지만 동일 batch의 override 갱신과 삭제가 정확히 겹치는 다중 저장소 경쟁은 공통 transaction 없이 완전 직렬화되지 않는다.
- desktop session cookie를 실행 중 브라우저에서만 삭제하면 bootstrap 재발급 IPC가 없어 launcher 재시작이 필요하다. 실제 Windows 설치 패키지와 mapped/network drive 차단은 Linux 기반 smoke 밖의 현장 확인 대상이다.
- 외부 DART·ECOS·공공데이터 자격 증명이 설정된 실제 운영 호출은 이번 로컬 검증에서 수행하지 않았다. 누락·손상·지연·부분 실패 시 핵심 흐름과 안내가 유지되는 계약까지 검증했다.

## 다음 라운드 우선순위

1. 실제 Windows 배포물과 로그인된 사용자 데이터로 launcher·세션 재발급·백업/복원 end-to-end 현장 smoke를 수행한다.
2. 운영 관측에서 동시 접근이 확인되면 v3 batch와 sidecar를 묶는 공통 lifecycle lock 또는 transactional store를 도입한다.
3. 외부 데이터 자격 증명이 있는 환경에서 기준일·부분 실패·복구 문구가 실제 upstream 응답과 일치하는지 주기적으로 확인한다.
