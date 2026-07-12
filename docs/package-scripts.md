# package scripts 분류 기준

기준일: 2026-07-12

`package.json` scripts는 이름을 대량 변경하지 않고 아래 범주로 읽습니다. 실제 release suite 구성은 `scripts/quality_gates.mjs`가 단일 기준입니다.

## 대표 명령

| 명령 | 분류 | 의미 |
| --- | --- | --- |
| `pnpm lint` | required / PR 기본 | ESLint 정적 검증입니다. React 훅, route handler, script 변경이 있으면 우선 실행합니다. |
| `pnpm test` | required / PR 기본 | Vitest 전체 단위·계약 테스트입니다. 순수 로직, 저장소, API contract 변경의 기본 확인입니다. |
| `pnpm build` | required / build 영향 | Next production build입니다. page, route, server/runtime, package script 영향이 있으면 실행합니다. |
| `pnpm components:app-import:guard` | required / architecture | production `src/components/**`가 route-private `src/app/**`를 import하면 실패합니다. |
| `pnpm verify` | recommended / 광범위 점검 | dumps/schema/freshness/DART/security/lint/typecheck/test를 한 번에 묶은 넓은 검증입니다. release registry suite는 아닙니다. |
| `pnpm planning:v2:complete` | required / planning v2 core | planning v2 static guard, security route scan, report/guide tests, smoke, fast e2e를 실행합니다. |
| `pnpm release:verify` | release primary | `scripts/quality_gates.mjs` registry의 release suite를 순차 실행하는 primary gate입니다. |

## PR 기본 게이트

- 일반 코드 변경: `pnpm lint`, `pnpm test`
- App Router page/API, Next runtime, package script 변경: `pnpm build`
- planning v2 core/API/route 변경: `pnpm planning:v2:complete`
- planning v2 core 변경 visibility가 잡히면: `pnpm planning:v2:regress`
- 사용자 화면, 셀렉터, 주요 플로우 변경: `pnpm e2e:rc`
- route SSOT/current screens 변경: `pnpm planning:ssot:check`
- shared component 또는 App Router module 이동: `pnpm components:app-import:guard`

## Release 게이트

- primary: `pnpm release:verify`
- companion: `pnpm build`
- 사용자 흐름 영향이 있으면 같은 소유자가 `pnpm e2e:rc`를 이어서 실행합니다.
- `release:verify` 구성은 `scripts/quality_gates.mjs`의 `QUALITY_GATE_SUITES["release:verify"]`를 기준으로 합니다.
- `pnpm planning:postgres:readiness`는 release suite의 optional gate이며, PostgreSQL target schema readiness evidence만 만들고 운영 DB migration을 실행하지 않습니다.

## 수동 운영·데이터 명령

- DART: `pnpm dart:corpindex`, `pnpm dart:ensure-corpindex`, `pnpm dart:watch*`, `pnpm dart:rules:*`
- FINLIFE/DataGo/Gov24: `pnpm finlife:sync*`, `pnpm finlife:inventory:report`, `pnpm datago:sync`, `pnpm products:sync`, `pnpm gov24:sync*`
- freshness/warmup: `pnpm freshness:report`, `pnpm data:doctor`, `pnpm warm:if-stale`, `pnpm daily:refresh*`
- planning ops: `pnpm planning:v2:ops:*`, `pnpm planning:v2:backfill-legacy-runs`, `pnpm planning:v2:migrate:*`
- 위 명령은 일반 PR 필수 게이트가 아니며, 실행했다면 `/work` 또는 release closeout에 목적과 결과를 남깁니다.

## Desktop·개발 보조 명령

- 개발 서버: `pnpm dev`, `pnpm dev:lan`, `pnpm dev:raw`
- production local run: `pnpm start`, `pnpm start:local`
- detached build: `pnpm build:detached`
- desktop package: `pnpm planning:v2:desktop:*`
- dependency/offline: `pnpm deps:approve-builds`, `pnpm deps:offline:*`, `pnpm offline:doctor`

## 사용 원칙

- 새 작업자는 먼저 PR 기본 게이트와 변경 영역별 conditional gate만 고릅니다.
- release 후보는 `pnpm release:verify && pnpm build`를 단일 소유자가 순차 실행합니다.
- data sync, ops, desktop 명령은 public API 검증을 대체하지 않습니다.
- script rename은 CI와 문서를 동시에 바꿀 준비가 된 경우에만 별도 작업으로 진행합니다.
