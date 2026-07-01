# 2026-06-28 P0-01 storage ownership

## 변경 파일
- `.env.example`
- `.env.local.example`
- `docs/deploy.md`
- `docs/planning-v2-family-mode.md`
- `docs/planning-v2-ops.md`
- `scripts/next_prod_safe.mjs`
- `scripts/planning_v2_desktop_launch.mjs`
- `src/lib/planning/auth/currentUser.ts`
- `src/lib/planning/store/namespace.ts`
- `tests/planning/auth/currentUser.test.ts`
- `tests/planning/auth/routeAuth.test.ts`
- `tests/planning/store/planningStoreNamespace.test.ts`

## 사용 skill
- `finance-skill-routing`: Finance Project 기본 적용 skill 조합 확인
- `planning-gate-selector`: P0-01 변경 범위에 맞는 auth/user-scope/lint/typecheck 검증 선택
- `work-log-closeout`: 변경 후 `/work` 종료 기록 형식 확인

## 변경 이유
- production 인증은 강제되지만 `PLANNING_NAMESPACE_ENABLED=false` 기본값이면 파일 저장소가 사용자 scope 없이 공용 root를 사용했습니다.
- 명시적 단일 사용자 topology도 공용 root 대신 `users/default` 레이아웃을 사용해야 합니다.
- desktop packaged topology는 local-only 성격이므로 단일 사용자 모드를 명시적으로 전달해야 합니다.

## 핵심 변경
- `assertPlanningStorageMode()`를 추가해 production에서 `PLANNING_NAMESPACE_ENABLED=true` 또는 `PLANNING_SINGLE_USER_MODE=true`가 없으면 설정 오류로 거부합니다.
- `PLANNING_SINGLE_USER_MODE=true`일 때 storage user를 `default`로 고정하고 `users/default` 경로를 사용하게 했습니다.
- `pnpm start` wrapper가 Next 런타임 시작 전에 같은 storage mode를 preflight합니다.
- desktop launch는 packaged runtime에 `PLANNING_SINGLE_USER_MODE=1`을 명시적으로 전달합니다.
- env 예제와 배포 문서에 multi-user/single-user 선택지, data inventory, 다중 프로세스 파일 저장소 주의사항을 추가했습니다.

## 검증
- 수정 전 실패 확인:
  - `corepack pnpm test tests/planning/auth/currentUser.test.ts` 실패: production storage ownership 미명시인데 `alice` 인증 성공
  - `corepack pnpm test tests/planning/store/planningStoreNamespace.test.ts` 실패: single-user mode에서도 `users/default`가 아니라 shared root에 저장
- 수정 후 성공:
  - `corepack pnpm test tests/planning/auth/currentUser.test.ts`
  - `corepack pnpm test tests/planning/store/planningStoreNamespace.test.ts`
  - `node --check scripts/next_prod_safe.mjs`
  - `node --check scripts/planning_v2_desktop_launch.mjs`
  - `corepack pnpm planning:user-scope:check`
  - `corepack pnpm planning:auth:check`
  - `corepack pnpm lint`
  - `corepack pnpm typecheck`

## 운영 inventory
- 현재 main HEAD와 문서 기준 커밋은 모두 `5e1cc1c901f9ad3925fb450a8446b192ed4bf8f5`입니다.
- 로컬 `.env.local`에는 Planning namespace/auth 관련 실제 값이 없고 `DATABASE_URL`만 설정되어 있습니다.
- 로컬 `.data/planning` 기준:
  - legacy transaction 파일: 0
  - canonical batch 파일: 0
  - shared profiles 파일: 0
  - shared runs 파일: 0
  - user namespace 디렉터리: 2 (`alice`, `default`)
- 실제 production 인스턴스 수, 운영 env 값, 공유 파일 root 여부는 이 workspace만으로 확정할 수 없습니다.

## 남은 리스크
- 실제 production이 여러 Node 프로세스나 여러 인스턴스에서 같은 `PLANNING_DATA_DIR`를 공유한다면 P1-02에서 lock/CAS/transaction 설계를 확정해야 합니다.
- 기존 운영이 shared-root 단일 사용자 데이터를 갖고 있다면 `PLANNING_SINGLE_USER_MODE=true` 전환 전 dry-run migration 또는 read-only fallback 계획이 필요합니다.
- P0-02에서 legacy 거래 import/list 경로를 canonical store로 전환하며 owner 불명 데이터 quarantine 정책을 별도로 검증해야 합니다.
