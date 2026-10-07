# ADR 0001: Planning deployment mode와 desktop-local 정책

- Status: Accepted
- Date: 2026-08-15
- Base main: `daeab493e24e9500e06f0f2b4b368e5c5bdc779d`
- Issue: #232
- Decision accepted: `desktop-local` only
- Runtime implementation: Phase C complete (2026-08-24)
- Supported end-to-end now: `desktop-local` production launcher only

## Context

Phase B 이전에는 Planning의 deployment topology와 보안 정책이 하나의 계약으로
판정되지 않았습니다.

- Production start는 host 인자를 무시하고 `127.0.0.1`에 bind합니다.
- Production Planning API는 `PLANNING_AUTH_REQUIRED` 값과 관계없이 항상
  authentication을 요구합니다.
- Desktop launcher는 single-user storage flag를 설정하지만 local
  identity/session 또는 capability를 만들지 않습니다.
- OAuth provider가 0개여도 Auth.js config와 production startup 자체는
  통과할 수 있으므로 provider 수는 desktop identity readiness의 증거가 아닙니다.
- `PLANNING_NAMESPACE_ENABLED`와 `PLANNING_SINGLE_USER_MODE`는 storage layout과
  deployment topology 의미를 함께 담고 있어 mode를 안전하게 추론할 수 없습니다.
- Planning file write lock은 한 Node process 안의 keyed queue이므로
  multi-process 또는 shared writer 안전성을 제공하지 않습니다.
- Desktop launcher의 single-instance lock은 launcher instance 사이만 조정하며,
  `trim`, `migrate`, `restore`, refresh/ops command 같은 별도 writer entrypoint가
  같은 data root를 변경하지 못한다는 증거가 아닙니다.
- 활성 Prisma runtime schema는 SQLite입니다. PostgreSQL schema와 readiness
  tooling이 존재하더라도 현재 production runtime provider로 승격된 것은 아닙니다.
- `docs/deploy.md`는 remote self-host가 현재 지원되는 것처럼 읽힐 수 있지만,
  proxy trust, remote identity, shared writer 계약은 완료되지 않았습니다.

이 불일치 때문에 storage flag나 loopback 여부만으로 지원 mode를 추론하면
인증·network·storage 경계를 조용히 완화할 수 있습니다.

## Decision

Planning deployment mode 이름은 다음 세 개로 고정합니다.

- Supported target: `desktop-local`
- Reserved but unsupported: `web-single`
- Unsupported: `web-multi`

`desktop-local` only 결정은 Accepted이며 Phase C에서 production launcher,
startup preflight, middleware, `currentUser`, desktop session, writer lease까지 같은
정책에 연결했습니다. 지원 완료 표현은 이 launcher 경로에만 적용합니다.

### desktop-local invariants

`desktop-local`은 정규화된 입력 사실이 다음 조건을 모두 만족할 때만 성공할 수
있습니다.

| Boundary | Required invariant |
|---|---|
| Bind host | 정확히 `127.0.0.1` |
| Reverse proxy | 없음; proxy trust는 `none` |
| Forwarded header trust | 불허 |
| Remote browser access | 불허 |
| Process/replica | application process가 정확히 1개, `single` |
| Writer exclusivity | 모든 지원 mutating entrypoint가 공유하는 `data-root-exclusive` ownership |
| Data root | local non-shared filesystem |
| Owner scope | `users/default`로 수렴 |
| Raw trusted auth header | 불허 |
| Identity mode | `desktop-local-session` |
| Identity provenance | `launcher-process` |
| Identity readiness | session/capability가 검증되고 준비됨 |
| Database provider | SQLite |
| Database connection | local `file` |
| Restore apply | 불허 |

입력의 `singleUserModeEnabled`는 `true`여야 하고 raw
`namespaceEnabled`는 `false`여야 합니다. Single-user mode가 내부적으로
`users/default` layout을 사용하는 사실과 raw
`PLANNING_NAMESPACE_ENABLED=true` multi-user configuration은 구분합니다.
둘을 함께 활성화하거나 일반 multi-user namespace를 desktop-local로 해석하지
않습니다.

`processModel: "single"`과 writer exclusivity는 독립된 정규화 사실입니다.
Application process가 하나라는 사실만으로 다른 process의 writer가 차단되지는
않습니다. 성공 decision은 `writerExclusivity: "data-root-exclusive"`도 요구하며,
이는 production server, desktop launcher/runtime, `trim`, `migrate`, `restore`,
refresh/ops command와 현재 지원 범위의 다른 mutating CLI가 하나의 검증 가능한
data-root-scoped exclusive ownership 경계 아래에 있음을 뜻합니다.

Process-local keyed queue, launcher 전용 instance lock, loopback bind, replica 수 1
또는 운영자의 동시 실행 금지 가정은 이 capability의 충분한 증거가 아닙니다.
현재 구현은 canonical app control root에 cross-process lease를 만들고, 공식
mutating package script와 desktop runtime child를 같은 capability 아래 등록합니다.
`process-local-only`, `multi-writer`, `unknown` 또는 누락 상태는
`DEPLOYMENT_POLICY_CONFLICT`로 fail closed합니다.

OAuth provider 수는 성공 조건이 아닙니다. 대신 identity mode가
`desktop-local-session`, provenance가 `launcher-process`, readiness가 `true`인
세 사실이 모두 필요합니다. Launcher는 고엔트로피 process-lifetime token과
loopback one-shot bootstrap을 만들고 `HttpOnly; SameSite=Strict` cookie로 전달합니다.
Loopback 자체, raw user ID header 또는 storage flag를 identity로 취급하지
않습니다.

Desktop 세션 실패는 일반 웹 OAuth 로그인과 분리된 launcher 재진입으로
복구합니다. `GET /api/auth/signin`은 유효한 desktop runtime 및 loopback
요청에서만 `/planning`의 세션 확인 화면으로 이동하고, 다른 Auth.js
endpoint는 desktop에서 노출하지 않습니다. 이 이동은 identity를 생성하지
않으며 유효한 launcher cookie가 없으면 기존 401/403/503 경계를 유지합니다.
일반 production 웹의 인증 강제와 Auth.js 설정·provider 계약은 바꾸지 않습니다.

Application-level at-rest encryption이 구현됐다고 주장하지 않습니다.
Local filesystem과 OS account 또는 disk encryption 같은 운영 통제는 별도
경계이며 제품의 app-level encryption 지원을 의미하지 않습니다.

### Unsupported and invalid modes

- Missing mode와 빈 mode는 `DEPLOYMENT_MODE_MISSING`으로 거부합니다.
- 등록되지 않은 mode는 `DEPLOYMENT_MODE_UNKNOWN`으로 거부합니다.
- `web-single`과 `web-multi`는 `DEPLOYMENT_MODE_UNSUPPORTED`으로 거부합니다.
- Startup preflight는 `web-single`과 `web-multi`를 모두 거부합니다.
- Storage, namespace, bind 또는 auth flag에서 mode를 자동 추론하지 않습니다.
- `desktop-local`의 bind, proxy, forwarded header, identity mode/provenance,
  process model, writer exclusivity, storage, database provider/connection 사실이
  모순되거나 누락되면
  `DEPLOYMENT_POLICY_CONFLICT` 또는 identity-only
  `DEPLOYMENT_AUTH_NOT_READY`를 반환하며 성공 decision으로 fallback하지
  않습니다.

Resolver는 여러 conflict를 canonical 순서로 반환합니다. 호출자는 message
문자열을 파싱하지 않고 machine-readable code와 `conflicts`를 사용합니다.

## Consequences

- `pnpm start`, `pnpm start:local`, `pnpm planning:v2:desktop:launch`는 같은
  desktop launcher로 수렴합니다.
- `scripts/next_prod_safe.mjs` 직접 실행과 `start:raw`는 launcher lease/capability가
  없으면 시작하지 않습니다.
- 공식 mutating package script는 canonical writer registry wrapper를 거치며,
  활성 runtime 또는 다른 writer가 같은 control root를 소유하면 fail closed합니다.
- stale lease는 같은 host이고 기록된 parent/child PID가 모두 `ESRCH`일 때만
  회수합니다. foreign host, malformed state, 권한 때문에 판정할 수 없는 PID는
  자동 회수하지 않습니다.
- Remote mutation, reverse proxy trust, shared filesystem writer와 web mode를
  활성화하지 않습니다.
- `V3_RESTORE_APPLY_DISABLED`를 유지합니다.
- Stored data format, namespace path, DB schema와 migration은 변경하지 않습니다.
- Next.js가 direct loopback request에 내부적으로 합성하는 정확한
  `x-forwarded-host/port/proto/for` 값만 정규화해 허용하며, 이를 외부 proxy 또는
  identity 신뢰 근거로 사용하지 않습니다.

## Follow-up

- Windows/macOS/Linux 설치 아티팩트별 실제 filesystem type 판정과 one-shot
  bootstrap UX를 릴리즈 후보에서 반복 확인합니다.
- Remote browser, reverse proxy, shared filesystem, PostgreSQL runtime 또는
  multi-user deployment가 필요하면 별도 ADR과 identity/writer 계약을 먼저
  승인해야 합니다.
- Related work: #233, #234, #235, #238, #242, #281, #288, #289.

## Alternatives rejected

- 기존 storage flag에서 deployment mode 자동 추론: 모호한 조합을 지원으로
  오인하므로 채택하지 않습니다.
- Loopback에서 production auth 비활성화: 같은 host의 다른 process나 browser
  공격에 대한 identity 경계를 제공하지 않으므로 채택하지 않습니다.
- `web-single` 임시 지원: proxy trust와 remote identity 계약이 없어 채택하지
  않습니다.
- Shared filesystem과 process-local lock으로 `web-multi` 지원: process 간
  serialization을 보장하지 않아 채택하지 않습니다.
- Phase B에서 restore apply 활성화: writer drain과 recovery 계약이 없어
  채택하지 않습니다.

## Rollback

Phase C runtime wiring을 되돌릴 때는 launcher, startup/auth consumer, writer
registry/lease를 한 계약으로 함께 되돌려야 합니다. 저장 데이터 포맷 자체는
변경하지 않았지만, 일부만 되돌려 direct production start나 concurrent writer를
다시 여는 것은 허용하지 않습니다. Rollback이 remote mode, raw trusted header
또는 모호한 mode inference를 활성화하는 근거가 되어서는 안 됩니다.
