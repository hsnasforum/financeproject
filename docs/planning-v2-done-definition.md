# Planning v2 Done Definition

## 완성 선언 게이트 (최종)
아래 3가지만 만족하면 Planning v2 완성 선언 기준을 충족합니다.
- 기술 게이트: `pnpm planning:v2:complete` PASS
- 기술 게이트(가능 시): 서버 실행 후 `pnpm planning:v2:acceptance` PASS
- 사용자 게이트: `docs/planning-v2-5min-selftest.md` 체크 항목 1회 완료

## 기능 Done (사용자)
- `/planning`에서 프로필 생성/편집/삭제가 가능하다.
- `/planning`에서 latest(또는 snapshotId) 기준으로 `simulate + scenarios`를 실행할 수 있다.
- `/planning`에서 실행 결과를 run으로 저장할 수 있다.
- `/planning/runs`에서 run 목록 조회/삭제가 가능하다.
- `/planning/runs`에서 run 2개 비교(diff)가 가능하다.
- `/planning/runs`에서 run JSON export(다운로드 또는 copy)가 가능하다.

## 운영 Done (OPS)
- `/ops/assumptions`에서 snapshot sync와 latest 상태 확인이 가능하다.
- assumptions history가 있으면 조회/rollback(set latest, confirm)이 가능하다.
- `/ops/planning`에서 snapshot/regression/cache/store 상태를 한 화면에서 확인할 수 있다.
- `/ops/planning-cleanup`이 있으면 dry-run과 confirm apply로 정리 작업을 수행할 수 있다.

## 품질 Done (게이트)
- `pnpm planning:v2:complete`가 통과한다.
- 로컬 서버 기동 후 `pnpm planning:v2:acceptance`가 통과한다(가능한 환경에서).
- `docs/planning-v2-5min-selftest.md` 체크를 1회 완료한다.
- 구성된 경우 `pnpm planning:v2:regress`가 통과한다.
- 로컬 서버 기동 후 `PLANNING_BASE_URL=... pnpm planning:v2:smoke:http`가 통과한다.

## 보안/프라이버시 Done
- planning/ops API는 local-only 정책을 준수한다.
- 쓰기/민감 액션은 프로젝트 정책에 맞는 CSRF/confirm 가드를 적용한다.
- `pnpm planning:v2:guard`가 통과한다.
- 응답/로그에 키/토큰/내부 경로(`.data/...`) 누출이 없다.

## 기능 플래그 Done
- 플래그 읽기 기준은 `src/lib/planning/config.ts` 단일 진입점으로 관리한다.
- 서버 플래그가 비활성화된 기능(Monte Carlo, includeProducts)은 UI와 API 모두에서 실행되지 않는다.
