# Docs Index

## Current Product State
- `planning v2` 본체는 완료 상태입니다.
- 홈, 플래닝, 공식 리포트, 실행 기록은 현재 코드 기준 주 경로입니다.
- 리포트 프로토타입은 기본 공개 경로가 아니며 `preview` 용도로만 남겨둡니다.

## Main Routes
- 홈: `/`
- 플래닝: `/planning`
- 공식 리포트 허브: `/planning/reports`
- 실행 기록: `/planning/runs`
- 추천 허브: `/recommend`
- 상품 탐색: `/products/catalog`
- 혜택 탐색: `/benefits`

## Prototype Policy
- `/planning/reports/prototype` 는 기본 진입 시 공식 리포트로 리다이렉트됩니다.
- 프로토타입 확인이 필요하면 `?preview=1` 을 붙여서 실험 화면을 엽니다.
- 사용자 안내와 내부 링크는 모두 공식 리포트(`/planning/reports`) 기준으로 유지합니다.

## Planning v2
- Contribution rules: `../CONTRIBUTING_PLANNING.md`
- Quickstart: [planning-v2-quickstart.md](./planning-v2-quickstart.md)
- User guide: [planning-v2-user.md](./planning-v2-user.md)
- Ops guide: [planning-v2-ops.md](./planning-v2-ops.md)
- Done definition: [planning-v2-done-definition.md](./planning-v2-done-definition.md)
- Freeze 정책: [planning-v2-freeze.md](./planning-v2-freeze.md)
- UX Freeze: [planning-v2-ux-freeze.md](./planning-v2-ux-freeze.md)
- Release checklist: [planning-v2-release-checklist.md](./planning-v2-release-checklist.md)
- Policy defaults: [planning-v2-policy-defaults.md](./planning-v2-policy-defaults.md)
- 5분 셀프 테스트: [planning-v2-5min-selftest.md](./planning-v2-5min-selftest.md)
- Backlog 분류: [planning-backlog.md](./planning-backlog.md)
- v3 kickoff: [planning-v3-kickoff.md](./planning-v3-kickoff.md)

## Operations
- Ops about: `/ops/about`
- Data sources ops: [data-sources-settings-ops.md](./data-sources-settings-ops.md)
- Vault 보안 화면: `/ops/security`
- Runtime: [runtime.md](./runtime.md)
- Windows: [windows.md](./windows.md)
- Update: [update.md](./update.md)
- Scheduler: [planning-v2-scheduler.md](./planning-v2-scheduler.md)
- Maintenance: [planning-v2-maintenance.md](./planning-v2-maintenance.md)
- Troubleshooting: [troubleshooting.md](./troubleshooting.md)
- Bug report template: [planning-v2-bug-report-template.md](./planning-v2-bug-report-template.md)

## Architecture And Release
- Architecture: [planning-v2-architecture.md](./planning-v2-architecture.md)
- Routes inventory: [routes-inventory.md](./routes-inventory.md)
- Changelog: [planning-v2-changelog.md](./planning-v2-changelog.md)
- Final report template: `docs/releases/planning-v2-final-report-{version}.md`
- Release ops checklist: `../RELEASE_CHECKLIST.md`
- Release note example: [releases/planning-v2-1.0.2.md](./releases/planning-v2-1.0.2.md)

## Additional Planning Docs
- Setup playbook: [planning-v2-setup-playbook.md](./planning-v2-setup-playbook.md)
- Desktop local: [planning-v2-desktop-local.md](./planning-v2-desktop-local.md)
- Assumptions: [planning-assumptions.md](./planning-assumptions.md)
- One page: [planning-v2-onepage.md](./planning-v2-onepage.md)
- Report recommendation: [planning-report-recommendation.md](./planning-report-recommendation.md)
- v3 migration: [planning-v3-migration.md](./planning-v3-migration.md)

## Announcements
- [planning-v2-complete.md](./announcements/planning-v2-complete.md)

## Completion Check
1. `pnpm planning:v2:complete`
2. 서버 실행 후 `pnpm planning:v2:acceptance`
3. [planning-v2-5min-selftest.md](./planning-v2-5min-selftest.md) 체크 항목 완료
4. `pnpm e2e:rc`
   - RC 핵심 Playwright 셋은 공유 `next dev` 서버 안정성을 위해 직렬 실행(`--workers=1`)으로 고정합니다.
   - 기본 묶음은 smoke, planning main flow, `/planning` 간단 시작 preview/accept, /planning/v3/news/settings alert-rules 후속 확인, DART flow, data-sources settings까지 유지합니다.
   - `/settings/data-sources`만 빠르게 다시 확인할 때는 `pnpm e2e:rc:data-sources`를 사용합니다.
   - DART 화면만 다시 확인할 때는 `pnpm e2e:rc:dart` 를 사용합니다.
5. `pnpm e2e:parallel:flake`
   - 병렬 flake 확인은 `flow-planner-to-history`, `flow-history-to-report`, `dart-flow` 3개 흐름만 `--workers=2`로 빠르게 재현합니다.
6. `pnpm e2e:parallel:report-flake`
   - `/planning/reports` 병렬 재현은 위 3개 흐름에 `planning-v2-fast`의 reports 계약 1건만 추가해 좁게 확인합니다.
7. `pnpm e2e:parallel:flake:prod`
   - 같은 병렬 3개 흐름을 `scripts/next_prod_safe.mjs` 기반 standalone runtime으로 다시 돌려 shared dev runtime 영향과 앱 회귀를 분리합니다.
   - launcher가 `.next/static`, `public`을 `.next/standalone`에 연결한 뒤 서버를 띄워 prod hydration 경로도 같이 확인합니다.
   - build/runtime launcher는 standalone 내부의 불필요한 `.next-*` 그림자 디렉터리와, 유휴 상태의 루트 `.next-e2e*`/`.next-host*`를 자동 정리합니다.
8. `pnpm e2e:parallel:report-flake:prod`
   - reports 중심 병렬 재현도 같은 standalone runtime 경로로 따로 확인합니다.
9. `pnpm e2e:parallel:classify -- --runs=3 --skip-build --stop-on-fail`
   - 최신 `.next`를 재사용해 dev/prod 병렬 3-flow 셋을 같은 횟수로 돌리고 pass/fail 요약을 한 번에 출력합니다.
   - fresh prod build까지 포함해 다시 보고 싶으면 `--skip-build` 를 빼고 실행합니다.
   - Playwright 관리 dev 서버는 `tsconfig.playwright.json` 을 써서 포트별 `.next-e2e-*` include가 root `tsconfig.json` 에 다시 쌓이지 않게 유지합니다.

## Core Change Memo
- `pnpm planning:v2:freeze:guard` 에서 `v2 core change` 가 감지되면 `pnpm planning:v2:regress` 까지 함께 실행합니다.
- 리뷰/릴리즈 문맥에는 `[v2-core-change]` 태그를 남깁니다.
