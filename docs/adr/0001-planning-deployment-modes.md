# ADR 0001: Planning deployment mode와 desktop-local 정책

- Status: Accepted
- Date: 2026-08-15
- Base main: `daeab493e24e9500e06f0f2b4b368e5c5bdc779d`
- Issue: #232
- Decision accepted: `desktop-local` only
- Runtime implementation: pending Phase C
- Supported end-to-end now: none

## Context

Planning의 deployment topology와 보안 정책은 현재 하나의 계약으로 판정되지
않습니다.

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

`desktop-local` only 결정은 Accepted입니다. 다만 Phase B에서는 decision과 pure
resolver 계약만 추가하며, Phase C runtime wiring과 launcher-established local
identity가 끝나기 전까지 end-to-end 지원 완료로 표현하지 않습니다.

### desktop-local invariants

`desktop-local`은 정규화된 입력 사실이 다음 조건을 모두 만족할 때만 성공할 수
있습니다.

| Boundary | Required invariant |
|---|---|
| Bind host | 정확히 `127.0.0.1` |
| Reverse proxy | 없음; proxy trust는 `none` |
| Forwarded header trust | 불허 |
| Remote browser access | 불허 |
| Process/replica | 정확히 1개, `single` |
| Writer | single writer |
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

OAuth provider 수는 성공 조건이 아닙니다. 대신 identity mode가
`desktop-local-session`, provenance가 `launcher-process`, readiness가 `true`인
세 사실이 모두 필요합니다. Phase C adapter는 launcher가 만든 process-lifetime
session 또는 capability를 실제로 검증한 뒤에만 이 세 값을 설정할 수 있습니다.
Loopback 자체, raw user ID header 또는 storage flag를 identity로 취급하지
않습니다.

Application-level at-rest encryption이 구현됐다고 주장하지 않습니다.
Local filesystem과 OS account 또는 disk encryption 같은 운영 통제는 별도
경계이며 제품의 app-level encryption 지원을 의미하지 않습니다.

### Unsupported and invalid modes

- Missing mode와 빈 mode는 `DEPLOYMENT_MODE_MISSING`으로 거부합니다.
- 등록되지 않은 mode는 `DEPLOYMENT_MODE_UNKNOWN`으로 거부합니다.
- `web-single`과 `web-multi`는 `DEPLOYMENT_MODE_UNSUPPORTED`으로 거부합니다.
- Phase C startup preflight는 `web-single`과 `web-multi`를 모두 거부해야
  합니다.
- Storage, namespace, bind 또는 auth flag에서 mode를 자동 추론하지 않습니다.
- `desktop-local`의 bind, proxy, forwarded header, identity mode/provenance,
  storage, database provider/connection 사실이 모순되거나 누락되면
  `DEPLOYMENT_POLICY_CONFLICT` 또는 identity-only
  `DEPLOYMENT_AUTH_NOT_READY`를 반환하며 성공 decision으로 fallback하지
  않습니다.

Resolver는 여러 conflict를 canonical 순서로 반환합니다. 호출자는 message
문자열을 파싱하지 않고 machine-readable code와 `conflicts`를 사용합니다.

## Consequences

- Phase B에서는 middleware, startup, launcher, auth, namespace, storage 또는
  database runtime 동작을 변경하지 않습니다.
- Phase C 완료 전 `desktop-local` 지원 완료를 주장하지 않습니다.
- Remote mutation, reverse proxy trust, shared writer와 web mode를 활성화하지
  않습니다.
- `V3_RESTORE_APPLY_DISABLED`를 유지합니다.
- Stored data format, namespace path, DB schema와 migration은 변경하지 않습니다.
- Remote self-host로 오해될 수 있는 deploy/env/handoff 문서 정정은 Phase D에서
  runtime 구현과 함께 수행합니다.

## Follow-up

- Phase C: startup, desktop launcher, middleware, `currentUser`, `routeAuth`가
  같은 resolver를 소비하도록 wiring하고 launcher-established local
  identity/session 또는 capability를 구현합니다.
- Phase D: `docs/deploy.md`, `.env.example`와 운영 handoff 문서를 실제 지원
  상태에 맞춥니다.
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

Phase B resolver는 runtime consumer에 연결되지 않으므로 ADR, resolver, contract
test를 되돌려도 현재 production 실행과 저장 데이터는 바뀌지 않습니다.
Rollback이 remote mode, raw trusted header 또는 모호한 mode inference를
활성화하는 근거가 되어서는 안 됩니다.
