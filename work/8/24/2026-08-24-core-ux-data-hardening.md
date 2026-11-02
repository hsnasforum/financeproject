# 핵심 사용자 흐름·상품·데이터 상태 개선

- 작업일: 2026-08-24
- 목표: 오랜만의 유지보수 라운드에서 핵심 사용자 경로를 다시 점검하고, 인증 경계·상품 탐색·데이터 최신성·모바일 사용성을 안전하게 보완한다.

## 변경 전 정리

1. 수정 대상 파일: `/planning` 화면과 워크스페이스 구성요소, 대시보드, 상품 카탈로그와 통합 소스 정책, DART 상태 API/UI, 사용자 문서와 관련 테스트.
2. 변경 이유: 비로그인 상태의 샘플 노출, 중복 온보딩과 운영 링크, 상품군 혼입·중복·금리 누락 표현, DART 설정과 실제 데이터 상태 혼동, 모바일 필터 가로 넘침을 줄이기 위해서다.
3. 검증 명령: 관련 Vitest, 인증·사용자 범위·라우트 SSOT·보안 가드, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e:rc`, 실제 로컬 브라우저 확인.

## 이번 라운드 완료 항목

1. `/planning` 진입 전에 현재 사용자를 확인하고, 인증 실패 시 저장 데이터와 샘플 지표를 읽지 않는 전용 로그인 안내를 표시한다.
2. 중복 온보딩, 공개 화면의 운영 링크, 일반 사용자에게 불필요한 디버그 편집기를 정리하고 스냅샷·다음 행동 문구를 쉬운 한국어로 통일했다.
3. 예금 상품군에서 적금·계좌·통장을 제외하고, `stableId` 병합 후 금융사명+상품명 기준으로 한 번 더 중복을 합치며 출처와 승자 식별자를 보존한다.
4. 금리 누락 표시와 모바일 검색·필터 배치를 보완하고, 대시보드에 상태 기반 `다음에 할 한 가지`를 추가했다.
5. OpenDART API 키 설정 여부와 공시 인덱스의 실제 존재·최신 상태를 분리하고, 운영 정책의 14일 기준으로 `fresh/stale/unknown`을 전달·표시한다.

## 주요 변경 파일

- `src/app/planning/page.tsx`, `src/components/planning/PlanningAuthRequiredState.tsx`, `src/components/PlanningWorkspaceClient.tsx`
- `src/components/planning/workspace/**`, `src/lib/planning/ui/**`
- `src/components/DashboardClient.tsx`, `src/app/products/catalog/page.tsx`, `src/lib/products/catalogExplorer.ts`
- `src/lib/sources/unified.ts`, `src/lib/sources/unifiedEnrichPolicy.ts`
- `src/lib/publicApis/dart/corpIndex.ts`, `src/app/api/public/disclosure/corpcodes/status/route.ts`, `src/components/OpenDartStatusCard.tsx`
- `README.md`, `USER_GUIDE.md`, 관련 단위·통합·E2E 테스트

## 사용 skill

- `finance-skill-routing`: 이번 라운드에 필요한 최소 로컬 skill 조합을 선택했다.
- `planning-gate-selector`: 인증·페이지·라우트·UI 변경에 맞는 검증 게이트를 정했다.
- `route-ssot-check`: 공개 링크를 `docs/current-screens.md`의 실제 사용자 경로와 대조했다.
- `dart-data-source-hardening`: DART 설정, 실제 인덱스 상태, 최신성, 부분 실패 안내를 분리했다.
- `browser:control-in-app-browser`: 로컬 앱을 390px 모바일 폭에서 직접 확인해 상품 검색창 압축과 가로 넘침을 추가로 수정했다.
- `work-log-closeout`: 변경·검증·잔여 위험을 이 문서로 마감했다.

## 검증 결과

- `corepack pnpm lint`: PASS
- `corepack pnpm test`: PASS, 853개 파일 / 3,235개 테스트
- `corepack pnpm build`: PASS, TypeScript 및 247개 페이지 생성 완료
- `corepack pnpm planning:auth:check`: PASS, 13개 파일 / 83개 테스트
- `corepack pnpm planning:user-scope:check`: PASS, 15개 파일 / 88개 테스트
- `corepack pnpm planning:current-screens:guard`: PASS
- `corepack pnpm planning:ssot:check`: PASS
- `corepack pnpm sec:scan:routes`: PASS, 변경된 mutation route 분류 포함
- `corepack pnpm e2e:rc`: PASS, 46개 통과 / 2개 제외
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/home-hero-carousel.spec.ts --workers=1 -g "home savings"`: PASS, 모바일 상품 검색·가로 넘침 회귀 1개
- `corepack pnpm multi-agent:guard`: PASS
- 실제 로컬 브라우저 확인: `/planning` 비로그인 전용 상태, `/products/catalog` 390px 검색·필터 폭과 가로 넘침 없음, `/settings/data-sources` DART 최신성·기준일 표시와 가로 넘침 없음 확인
- `git diff --check`: PASS

## 남은 리스크와 엣지케이스

- [blocked] Desktop Local Phase C의 단일 writer 보장은 이번 변경에 포함하지 않았다. 현재 launcher lock은 앱 인스턴스만 막고 저장소 lock은 프로세스 내부에서만 유효하므로, 별도 CLI·스케줄러까지 포함하는 data-root 전용 writer lease/registry 기반이 먼저 필요하다. 이 기반 없이 인증을 끄거나 Desktop Local 완료로 표시하면 동시 쓰기 손상 가능성이 있다.
- 실제 로그인된 운영 계정으로 수동 브라우저 세션을 끝까지 진행하지는 않았다. 인증·사용자 범위 가드와 E2E는 통과했지만 배포 환경의 SSO 설정은 별도 운영 확인 대상이다.
- 로컬 DART 인덱스는 확인 당시 14일 기준보다 오래된 상태로 표시됐다. UI는 정상적으로 `오래됨`을 안내하며, 데이터 자체를 최신화하려면 문서화된 동기화 흐름을 실행해야 한다.

## 다음 라운드 우선순위

1. data-root 전용 writer lease/registry와 지원되는 mutating CLI·스케줄러 소유권 계약을 먼저 구현한다.
2. 그 기반 위에서 Desktop Local Phase C의 인증 수명주기와 다중 프로세스 smoke를 닫는다.
3. 로그인된 실제 사용자 세션으로 플래닝 생성부터 리포트 확인까지 운영 환경 smoke를 보강한다.
