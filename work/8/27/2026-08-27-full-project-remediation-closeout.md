# 2026-08-27 전체 프로젝트 개선 계획 구현 마감

## 상태

- 완료. 계획 보고서의 코드·프로젝트 구조, UI/UX, 사용자 흐름, 데이터 소스, 사용자 소유권, 백업/복구, Planning v3, desktop-local 배포 범위를 구현하고 통합 검증까지 닫았다.
- 기준 Git HEAD: `6a51f8d3a24394ba239838a78c8c19aa590fc180`
- 이 문서는 `work/8/26/2026-08-26-full-project-hardening-final-closeout.md`의 남은 Windows·운영 검증 항목을 포함해 최종 상태를 갱신한다.

## 변경 전 계획

1. 수정 대상 파일: 공개·Planning·설정 화면과 공통 UI, 인증·사용자 범위·백업·Planning v3 저장 계층, DART·상품·최신성 계층, desktop build/install/launch/update/uninstall 및 release workflow, 관련 문서와 테스트.
2. 변경 이유: 비전문가가 상태와 다음 행동을 쉽게 이해하도록 하고, 데이터 없음·지연·부분 실패에도 핵심 흐름을 유지하며, 사용자별 데이터와 데스크톱 설치 경계를 안전하게 고정하기 위해서다.
3. 검증 명령: focused Vitest, `pnpm release:verify`, `pnpm e2e:rc`, `pnpm lint`, `pnpm typecheck`, 네이티브 Windows 설치·업데이트·제거 smoke, `git diff --check`.

## 핵심 변경

- 공개·Planning·설정 화면의 빈 상태, 오류, 재시도, 인증 필요, 기준 시점과 다음 행동을 쉬운 한국어와 점진적 공개 구조로 통일하고 모바일 내비게이션·키보드 접근성·metadata 계약을 보완했다.
- DART·공공데이터·상품 데이터는 최신성, 출처, 부분 실패와 실제 영향 범위를 분리해 노출하고, 설정이 없거나 upstream이 실패해도 핵심 화면이 유지되도록 했다.
- 추천·Planning v2/v3·feedback·보고서·override·batch lifecycle을 현재 사용자 범위로 고정하고, stored-first 읽기와 synthetic stored-only 쓰기 차단, lifecycle lock과 rollback 계약을 적용했다.
- 백업은 인증 전 큰 본문 차단, 업로드 크기 제한, 사용자별 manifest·checkpoint·13개 Planning v3 owner 검증, replace restore rollback, 완료 영수증과 설정용 production 경계를 추가했다.
- desktop-local은 설치 identity·immutable provenance·고엔트로피 loopback session·writer lease·live lock·설정 우선순위·symlink/junction 방어·데이터 보존형 update/uninstall을 구현하고 Windows native 검증까지 완료했다.

## 주요 변경 파일군

- UI/UX: `src/app/**`, `src/components/**`, `src/lib/navigation/publicMetadata.ts`, `src/lib/dataSources/**`, `src/lib/sources/**`
- 사용자·백업: `src/lib/planning/auth/currentUser.ts`, `src/lib/ops/backup/**`, `src/app/api/ops/backup/**`, `src/app/api/settings/**`, `middleware.ts`
- Planning v3: `src/lib/planning/v3/service/**`, `src/lib/planning/v3/store/**`, `src/app/api/planning/v3/**`
- desktop/release: `scripts/planning_*`, `scripts/next_prod_safe.mjs`, `scripts/playwright_with_webserver_debug.mjs`, `.github/workflows/**`, `package.json`
- 문서·계약: `README.md`, `USER_GUIDE.md`, `docs/**`, `tests/**`, `config/data-freshness-exceptions.json`

## 사용 skill

- `finance-skill-routing`: 전체 범위에서 필요한 최소 로컬 skill 조합을 선택했다.
- `planning-gate-selector`: UI, route, 데이터 계층, desktop/release 변경의 검증 게이트를 정했다.
- `dart-data-source-hardening`: DART·공공데이터의 실패 처리, 최신성, 설정 영향과 문서 계약을 점검했다.
- `route-ssot-check`: 공개 링크, production-hidden route와 `docs/current-screens.md`의 일치를 확인했다.
- `planning-v3-batch-contract-narrowing`: stored-first, legacy fallback, synthetic stored-only와 batch 쓰기 경계를 유지했다.
- `work-log-closeout`: 변경·검증·운영 상태를 이 종료 기록으로 마감했다.

## 검증 결과

- `corepack pnpm release:verify`: PASS.
  - 의존성 감사: 알려진 advisory 0건.
  - freshness strict: snapshot 8개, 승인 예외 8개, 누락·형식 오류 0개.
  - Planning 빠른 E2E 8건, 호환성 8건, 회귀 시나리오 9건, 전체 Planning E2E 10건 통과.
  - 전체 Vitest: 883개 파일, 3,469건 통과, 플랫폼·모드 조건부 4건 제외.
  - Next.js production build: TypeScript 통과, 254개 경로 생성 완료.
  - release contract E2E 8건, production smoke, desktop smoke 통과.
  - route SSOT: 5개 파일, 11건 통과.
- `corepack pnpm e2e:rc`: PASS, 사용자 흐름 46건 통과, 실행 모드 조건부 2건 제외.
- `corepack pnpm lint`: PASS.
- `corepack pnpm typecheck`: PASS.
- `git diff --check`: PASS.

## Windows native 배포 검증

- Windows native Node에서 build, install, production launch, desktop smoke, update, locked-file 교체, uninstall을 실제 실행했다.
- artifact manifest는 앱 버전 `1.4.0`, 기준 Git HEAD, lockfile·파일 inventory·checksum provenance를 포함했고 100,628개 파일 / 1,771,166,066 bytes를 교차 검증했다.
- 잘못된 설치 provenance와 허용되지 않은 uninstall 대상은 fail-closed로 거부했고, 실행 중 lock과 symlink/junction 경계도 차단했다.
- 정상 update/uninstall에서는 설정과 사용자 데이터가 보존되고, launcher·wrapper·install state만 계약대로 교체 또는 제거되는 것을 확인했다.
- 검증 종료 후 네이티브 설치본, 임시 Node runtime, 설정 smoke DB, repo trace와 stale desktop lock을 정확한 검증 경로에서 제거했다.

## 재현 방법

1. `corepack pnpm release:verify`
2. `corepack pnpm e2e:rc`
3. `corepack pnpm lint`
4. `corepack pnpm typecheck`
5. `git diff --check`

## 남은 범위와 리스크

- 현재 문서화된 지원 계약과 계획 범위 안에서 미완료 항목 또는 식별된 미해결 코드 리스크는 없다.
- 실제 DART·ECOS·공공데이터 사업자의 가용성과 사용자별 자격 증명은 외부 운영 조건이다. 코드에서는 기준 시점·설정 누락·지연·부분 실패를 명시하고 핵심 흐름을 유지하는 fallback까지 검증했다.
- 다중 프로세스 공유 저장소는 지원하지 않고 단일 writer desktop-local을 공식 계약으로 고정했다. 지원하지 않는 실행 모드는 시작 단계에서 fail-closed로 차단한다.
