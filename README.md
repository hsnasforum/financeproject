# Finance Project (v1.0.4)

개인 재무설계, 금융상품 추천, 공공데이터 연동, DART 공시 모니터링을 통합한 Next.js 기반 서비스입니다.

## Planning v2 완료 판정

Planning v2의 완료 선언은 아래 게이트가 PASS할 때만 인정합니다.

```bash
pnpm planning:v2:complete
```

성공 기준 문구:

`✅ P97 COMPLETE — 모든 게이트 통과(테스트/스모크/가드/회귀)`

Planning v2 문서:

- `CONTRIBUTING_PLANNING.md`
- `docs/planning-v2-onepage.md`
- `docs/planning-v2-freeze.md`
- `docs/planning-v2-quickstart.md`
- `docs/planning-v2-user.md`
- `docs/planning-v2-ops.md`
- `docs/planning-v2-scheduler.md`
- `docs/planning-v2-maintenance.md`
- `docs/planning-v2-bug-report-template.md`
- `docs/planning-v2-release-checklist.md`
- `docs/releases/planning-v2-final-report-{version}.md`


## 핵심 진입 경로

- 메인 진입: `/dashboard`
- 핵심 기능:
  - `/planning`
  - `/recommend`
  - `/public/dart`
  - `/settings/data-sources`
  - `/products/catalog` (통합 탐색 우선)

## 주요 기능

- 재무설계(Planner): 입력 기반 지표/액션 제안
- 추천(Recommend): 결과 저장/히스토리/리포트 연동
- DART: digest/alerts/daily brief 생성 및 노출
- 데이터 소스 상태/헬스 체크 대시보드
- 일일 갱신 파이프라인(`daily:refresh`) + 아티팩트 생성

## 기술 스택

- Next.js (App Router), React, TypeScript
- Tailwind CSS
- Prisma + SQLite
- Vitest + Playwright + ESLint

## 빠른 시작

```bash
pnpm install
cp .env.local.example .env.local
pnpm dev
```

- 로컬: `http://localhost:3000`
- LAN 개발 서버: `pnpm dev:lan`
- WSL에서는 `pnpm dev`가 기본적으로 `0.0.0.0`에 바인드하고, Windows 브라우저용 `127.0.0.1 -> WSL IPv4` localhost bridge만 추가로 엽니다.

## 필수/주요 명령어

```bash
pnpm verify
pnpm multi-agent:guard
pnpm cleanup:next-artifacts
pnpm cleanup:next-artifacts -- --build-preflight
pnpm build
pnpm build:detached
# dev 서버나 다른 repo build가 shared dist 를 쓰는 중이면 격리 distDir(.next-build, .next-build-<pid> 등)로 자동 우회
# cleanup:next-artifacts 는 최신 성공 isolated build(.next-build-info.json 기준)는 보존하고,
# 오래된 .next-build-* / 대응 -tsconfig.json / stale build metadata 를 정리
# cleanup:next-artifacts -- --build-preflight 는 build/release 직전 tracked isolated build의 standalone/.data shadow도 같이 정리
# dev 서버가 살아 있어도 오래된 .next-build* 정리는 계속 수행하고, 공유 runtime 산출물(.next-host/.next-e2e 등) 정리만 active-runtime이면 건너뜀
# build/release preflight용 standalone/.data 정리는 active build/prod/playwright runtime이 없을 때만 수행
# local production smoke 는 마지막 격리 build 도 자동 재사용
# 배포용 .next 가 꼭 필요하면 dev 서버를 내리고 다시 pnpm build
# Codex foreground exec에서 장시간 build가 143으로 끊기면 pnpm build:detached 또는 runbook 절차를 사용
pnpm e2e
```

추가:

- DART 워치: `pnpm dart:watch`
- 일일 갱신: `pnpm daily:refresh`
- RC 핵심 E2E 셋: `pnpm e2e:rc`
  - 공유 `next dev` 서버 기준으로 직렬 실행(`--workers=1`)해 RC 게이트를 결정적으로 유지합니다.
  - 기본 묶음은 핵심 공개 흐름(smoke, planning main flow, `/planning` 간단 시작 preview/accept, /planning/v3/news/settings alert-rules 후속 확인, DART flow, data-sources settings)까지 직렬로 확인합니다.
  - `/settings/data-sources`만 빠르게 다시 확인할 때는 `pnpm e2e:rc:data-sources`를 사용합니다.
  - DART 화면만 빠르게 다시 확인할 때는 `pnpm e2e:rc:dart` 를 사용합니다.
  - dev Playwright는 기본적으로 `E2E_DISABLE_DEV_HMR=1`로 `/_next/webpack-hmr` websocket을 막아 HMR reload 노이즈를 테스트 흐름에서 분리합니다.
  - dev HMR websocket까지 포함한 원래 조건을 다시 재현해야 하면 `pnpm e2e:rc:dev-hmr`를 사용합니다.
  - ad hoc 명령에는 여전히 `E2E_DISABLE_DEV_HMR=0`을 직접 줄 수 있습니다.
- 병렬 flake 재현 셋: `pnpm e2e:parallel:flake`
  - `flow-planner-to-history`, `flow-history-to-report`, `dart-flow` 3개 흐름만 `--workers=2`로 빠르게 재현합니다.
- 병렬 reports 중심 재현 셋: `pnpm e2e:parallel:report-flake`
  - 기존 3개 흐름에 `planning-v2-fast`의 reports 진입 계약 1건만 추가해 `/planning/reports` 병렬 flake를 더 좁게 확인합니다.
- production runtime 병렬 셋: `pnpm e2e:parallel:flake:prod`
  - 같은 3개 흐름을 `scripts/next_prod_safe.mjs` 기반 standalone runtime으로 다시 돌려 shared `next dev --webpack` 노이즈와 앱 회귀를 분리합니다.
  - launcher가 `.next/static`, `public`을 `.next/standalone`에 연결한 뒤 서버를 띄워 prod hydration 경로를 실제와 가깝게 확인합니다.
  - build/runtime launcher는 standalone 내부의 불필요한 `.next-*` 그림자 디렉터리와, 유휴 상태의 루트 `.next-e2e*`/`.next-host*`를 자동 정리합니다.
- production runtime reports 셋: `pnpm e2e:parallel:report-flake:prod`
  - reports 중심 병렬 재현도 같은 standalone runtime 경로로 따로 확인합니다.
- 반복 분류 러너: `pnpm e2e:parallel:classify -- --runs=3 --skip-build --stop-on-fail`
  - 최신 `.next`를 재사용해 dev/prod 병렬 3-flow 셋을 같은 횟수로 돌리고 pass/fail 요약을 한 번에 출력합니다.
  - fresh prod build까지 포함해 다시 보고 싶으면 `--skip-build` 를 빼고 실행합니다.
  - Playwright가 띄우는 dev 서버는 `tsconfig.playwright.json` 을 사용해 포트별 `.next-e2e-*` 타입 경로가 root `tsconfig.json` 을 다시 더럽히지 않게 유지합니다.
  - dev HMR websocket까지 포함한 원래 조건으로 다시 분류하려면 `pnpm e2e:parallel:classify:dev-hmr -- --runs=3 --skip-build` 를 사용합니다.
- 멀티 에이전트 지침 가드: `pnpm multi-agent:guard`
  - `.codex/config.toml`, `.codex/rules/default.rules`, `.codex/skills/*/SKILL.md`, `.codex/agents/*.toml`, `scripts/prompts/multi-agent/*.md` 가 git 관리 대상인지와 핵심 handoff 필드가 남아 있는지를 함께 점검합니다.
  - 최신 `/work` closeout이 `work/<month>/<day>/YYYY-MM-DD-<slug>.md` 경로와 핵심 섹션(`사용 skill`, 검증, 남은 리스크, 다음 라운드)을 지키는지도 같이 확인하고, 아직 untracked이면 `latestWorkNoteTracking=untracked`로 상태를 같이 출력합니다.
  - 현재 라운드 closeout까지 반영된 `latestTrackedWorkNote` 정렬이 필요하면 최종 guard 전에 해당 `/work` note를 git tracked 상태로 맞춥니다.
- foreground build 우회 helper: `pnpm build:detached`
  - 장시간 build 재현 전 `pnpm cleanup:next-artifacts -- --build-preflight`로 tracked isolated build의 `standalone/.data` shadow까지 같이 정리하면 `ENOTEMPTY` 계열 dist 충돌을 줄일 수 있습니다.
  - dev 서버가 살아 있는 상태에서도 오래된 `.next-build*`는 정리되지만, 공유 runtime 산출물 정리는 active runtime이 비는 시점까지 보류됩니다.
  - `pnpm build`와 `pnpm release:verify`도 같은 build-preflight cleanup 경로를 먼저 사용합니다.
  - Codex foreground exec처럼 장시간 build 세션이 잘릴 수 있는 환경에서 detached worker로 `pnpm build`를 시작하고, log/exit json 경로를 출력합니다.

## CI/자동화

- CI 게이트: `.github/workflows/ci.yml`
  - `pnpm test`
  - `pnpm planning:v2:complete`
  - `pnpm planning:v2:compat`
  - `pnpm build`
- E2E 스모크/플로우: `.github/workflows/e2e-smoke.yml`
- Daily refresh: `.github/workflows/daily-refresh.yml`
- Tag release: `.github/workflows/release.yml` (`v*` 태그 푸시 시 GitHub Release 생성)

### Release Ops

- 체크리스트: `RELEASE_CHECKLIST.md`
- 준비: `pnpm release:prepare -- --version=x.y.z`
- 검증: `pnpm release:verify`
  - 현재 `release:verify`는 먼저 `pnpm cleanup:next-artifacts -- --build-preflight` preflight를 실행해 stale `.next-build*`와 tracked isolated build의 `standalone/.data` shadow를 정리한 뒤, `pnpm test`, `pnpm planning:v2:complete`, `pnpm multi-agent:guard`를 포함한 하위 게이트를 순차 실행합니다.
  - 내부 `planning:v2:e2e:fast`는 기존 dev/e2e 서버를 재사용하지 않도록 전용 포트와 전용 e2e planning data dir로 실행합니다.
- planning SSOT gate: `pnpm planning:ssot:check`
- current screens gate: `pnpm planning:current-screens:guard`

## 운영 보안

- production에서 `/api/dev/*`는 공통 차단(404)
- production에서 dev/debug 화면도 비노출:
  - `/dashboard/artifacts`
  - `/dev/*`
  - `/debug/unified`
- API 키는 서버 환경변수로만 관리 (`NEXT_PUBLIC_*`로 노출 금지)

## 문서

- 화면 카탈로그: `docs/current-screens.md`
- 배포 가이드: `docs/deploy.md`
- 릴리즈 노트: `docs/release-notes.md`
- 릴리즈 체크리스트: `docs/release-checklist.md`
- 유지보수 루틴: `docs/maintenance.md`
- 데이터 소스 운영 체크리스트: `docs/data-sources-settings-ops.md`
- daily refresh 운영: `docs/daily-refresh.md`
- 멀티 에이전트 반복 절차: `multi_agent.md`
- 작업 로그 정책: `work/README.md` (`work/<month>/<day>/YYYY-MM-DD-<slug>.md`)
