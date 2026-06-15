# 2026-04-12 보안 하드닝 1차 착수

## 변경 파일
- `middleware.ts`
- `tests/middleware-security.test.ts`
- `package.json`
- `pnpm-lock.yaml`

## 사용 skill
- `planning-gate-selector`: 보안 수정이 route guard, API, Next 런타임에 걸쳐 있어 최소 검증 세트를 고정
- `route-ssot-check`: dev/debug path를 local-only로 좁힐 때 production-hidden 계약이 깨지지 않는지 확인
- `work-log-closeout`: 오늘 라운드의 실제 변경과 실제 검증 결과를 표준 형식으로 정리

## 변경 이유
- `pnpm audit --json` 기준 `next@16.1.6`에 High 보안 권고가 남아 있어 패치 버전 반영이 필요했습니다.
- 개발 환경에서 `/api/dev/*`, `/dev/*`, `/debug/*`, `/dashboard/artifacts`가 미들웨어 local-only 보호 없이 열려 있어, WSL/Docker/devcontainer의 LAN 바인딩 상황에서 원격 접근 여지가 있었습니다.

## 핵심 변경
- `next`와 `eslint-config-next`를 `16.2.3`으로 올리고 lockfile을 갱신했습니다.
- `middleware.ts`에 dev/debug 전용 path 판별을 추가해 개발 환경에서만 local-only를 강제하도록 했습니다.
- production에서는 dev-only route를 미들웨어가 403으로 가로채지 않게 두어, 기존 `onlyDev()`의 404 의미를 유지했습니다.
- `tests/middleware-security.test.ts`에 dev API/dev page remote 차단과 production fallthrough 케이스를 추가했습니다.
- `docs/current-screens.md`는 수정하지 않았습니다. production 기준 `/api/dev/*` 404 계약은 그대로 유지됩니다.

## 검증
- `sed -n '1,220p' work/4/12/2026-04-12-worktree-scope-helper.md`
- `sed -n '1,220p' .codex/skills/work-log-closeout/SKILL.md`
- `sed -n '1,220p' .codex/skills/planning-gate-selector/SKILL.md`
- `sed -n '1,220p' .codex/skills/route-ssot-check/SKILL.md`
- `pnpm up next@16.2.3 eslint-config-next@16.2.3`
- `pnpm exec vitest run tests/middleware-security.test.ts tests/trusted-origin.test.ts tests/planning-v3-write-route-guards.test.ts tests/recovery-reset.test.ts tests/planning-v3-journal-api.test.ts`
  - PASS (5 files, 32 tests)
- `pnpm sec:check`
  - PASS
- `pnpm planning:current-screens:guard`
  - PASS (5 files, 9 tests)
- `pnpm lint`
  - PASS
- `pnpm build`
  - PASS
- `pnpm audit --json`
  - 재확인 결과 `next` advisory는 0건, 전체 메타데이터는 `high 14 / moderate 20 / low 1`
- `git diff --check -- package.json pnpm-lock.yaml middleware.ts tests/middleware-security.test.ts`
  - PASS

## 남은 리스크
- 이번 라운드로 `next` direct High 한 건은 제거했지만, `pnpm audit` 기준 transitive/dev chain 중심의 `high 14`가 남아 있습니다.
- CSP의 production `script-src 'unsafe-inline'`는 그대로라서, 이번 라운드는 dev/debug surface 보호와 프레임워크 패치까지만 마감했습니다.
- `package.json`은 이번 라운드 전부터 dirty 상태였고, 기존 `worktree:scope` 변경은 보존한 채 dependency 버전만 추가 반영했습니다.
