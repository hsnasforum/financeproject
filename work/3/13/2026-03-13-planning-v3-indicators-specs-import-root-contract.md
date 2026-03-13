# 2026-03-13 planning-v3 indicators-specs-import-root-contract

## 변경 파일
- 추가 코드 수정 없음
- audit/closeout 대상 dirty subset
  - `planning/v3/indicators/specOverrides.ts`
  - `planning/v3/indicators/specOverrides.test.ts`
  - `planning/v3/indicators/store/index.ts`
  - `planning/v3/indicators/store/store.test.ts`
  - `src/app/api/planning/v3/indicators/specs/route.ts`
  - `tests/planning-v3-indicators-specs-import-api.test.ts`
  - `planning/v3/indicators/rootDir.ts`
- `work/3/13/2026-03-13-planning-v3-indicators-specs-import-root-contract.md`

## 사용 skill
- `planning-gate-selector`: env-aware root + import/apply + route 범위에 맞는 최소 검증 세트를 `vitest + eslint + build + diff check`로 잠그는 데 사용
- `work-log-closeout`: 이번 closeout 결과와 미실행 검증을 `/work` 형식으로 남기는 데 사용

## 변경 이유
- latest `indicators connector harness hardening` note가 다음 우선순위 1번으로 `indicators specs import/root contract`를 남겼다.
- 현재 dirty subset은 `specOverrides / store / single API route / direct API test`로 응집돼 있고, `news / alerts / connector harness / runtime`를 다시 열지 않고도 원인 분리가 가능하다.
- 이번 라운드는 env-aware root와 import dry-run/apply semantics를 새로 바꾸는 것이 아니라, 이미 남아 있던 dirty contract가 실제로 일관되게 동작하는지 확인하고 좁은 검증으로 잠그는 것이 목적이다.

## 핵심 변경
- `specOverrides.ts`와 `store/index.ts`는 모두 hard-coded `process.cwd()/.data/indicators` 기본값 대신 `resolveIndicatorsRootDir()`를 call-time default root로 쓰는 방향으로 정렬돼 있음을 재확인했다.
- `specOverrides.test.ts`와 `store/store.test.ts`는 `PLANNING_DATA_DIR`를 테스트 중간에 바꿔도 default root가 그 시점 값을 따라가는 계약을 직접 고정한다.
- `src/app/api/planning/v3/indicators/specs/route.ts`는 same-origin read/write guard와 `requireCsrf(..., { allowWhenCookieMissing: true })`, `@/lib/planning/v3/...` import path 정렬을 함께 유지하고 있었다.
- `tests/planning-v3-indicators-specs-import-api.test.ts`는 same-origin remote dry-run/apply, env-aware root persistence, cross-origin 차단까지 직접 잠그고 있어 route/store/specOverrides 계약과 일치했다.
- 조건부로 `planning/v3/indicators/rootDir.ts`와 `src/lib/planning/v3/security/whitelist.ts`만 확인했고, `news / alerts / connectors / runtime`로는 확대하지 않았다.

## 검증
- 기준선/범위 확인
  - `sed -n '1,220p' .codex/skills/planning-gate-selector/SKILL.md`
  - `sed -n '1,220p' .codex/skills/work-log-closeout/SKILL.md`
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-indicators-connector-harness-hardening.md`
  - `git status --short -- planning/v3/indicators/specOverrides.ts planning/v3/indicators/specOverrides.test.ts planning/v3/indicators/store/index.ts planning/v3/indicators/store/store.test.ts src/app/api/planning/v3/indicators/specs/route.ts tests/planning-v3-indicators-specs-import-api.test.ts planning/v3/indicators/rootDir.ts src/lib/planning/v3/security/whitelist.ts`
- 정적 audit
  - `git diff --unified=80 -- planning/v3/indicators/specOverrides.ts planning/v3/indicators/specOverrides.test.ts planning/v3/indicators/store/index.ts planning/v3/indicators/store/store.test.ts src/app/api/planning/v3/indicators/specs/route.ts tests/planning-v3-indicators-specs-import-api.test.ts planning/v3/indicators/rootDir.ts`
  - `sed -n '1,320p' planning/v3/indicators/specOverrides.ts`
  - `sed -n '1,320p' planning/v3/indicators/store/index.ts`
  - `sed -n '1,280p' src/app/api/planning/v3/indicators/specs/route.ts`
  - `sed -n '1,220p' planning/v3/indicators/rootDir.ts`
  - `sed -n '1,260p' planning/v3/indicators/specOverrides.test.ts`
  - `sed -n '1,260p' planning/v3/indicators/store/store.test.ts`
  - `sed -n '1,320p' tests/planning-v3-indicators-specs-import-api.test.ts`
  - `sed -n '1,220p' src/lib/planning/v3/security/whitelist.ts`
- 실행한 검증
  - `pnpm exec vitest run planning/v3/indicators/specOverrides.test.ts planning/v3/indicators/store/store.test.ts tests/planning-v3-indicators-specs-import-api.test.ts`
  - `pnpm exec eslint planning/v3/indicators/specOverrides.ts planning/v3/indicators/specOverrides.test.ts planning/v3/indicators/store/index.ts planning/v3/indicators/store/store.test.ts src/app/api/planning/v3/indicators/specs/route.ts tests/planning-v3-indicators-specs-import-api.test.ts planning/v3/indicators/rootDir.ts src/lib/planning/v3/security/whitelist.ts`
  - `pnpm build`
  - `git diff --check -- planning/v3/indicators/specOverrides.ts planning/v3/indicators/specOverrides.test.ts planning/v3/indicators/store/index.ts planning/v3/indicators/store/store.test.ts src/app/api/planning/v3/indicators/specs/route.ts tests/planning-v3-indicators-specs-import-api.test.ts planning/v3/indicators/rootDir.ts work/3/13/2026-03-13-planning-v3-indicators-specs-import-root-contract.md`
- 미실행 검증
  - `pnpm e2e:rc`
  - `pnpm release:verify`
  - `pnpm planning:v2:complete`

## 남은 리스크
- 이번 라운드는 `specOverrides / store / specs route`만 닫았으므로 `news read-only surface`, `news write/settings surface`는 그대로 남아 있다.
- `rootDir.ts`는 env-aware default root를 설명하는 최소 helper로 확인했지만, 이후 indicators persistence가 더 넓어지면 인접 route/store들이 같은 helper를 계속 쓰는지 다시 묶어 확인해야 한다.
- 추가 코드 수정은 하지 않았기 때문에 현재 dirty의 의미는 “계약이 이미 맞는 상태를 검증으로 잠금”에 가깝다.

## 이번 라운드 완료 항목
- `indicators specs import/root contract` 배치를 `specOverrides / store / route / direct API test` 범위로 잠갔다.
- env-aware root, import dry-run/apply, same-origin/CSRF route contract이 direct tests와 build까지 일치함을 확인했다.
- `news / alerts / connector harness / runtime` 재오픈 없이 현재 dirty subset만 검증으로 닫았다.

## 다음 라운드 우선순위
1. `news read-only surface`
2. `news write/settings surface`
