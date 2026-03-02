# Release Process (Local)

이 문서는 Planning v2 릴리즈의 표준 실행 절차를 요약합니다.

## Required Gates

필수:

1. `pnpm test`
2. `pnpm planning:v2:complete`
3. `pnpm release:verify`

`release:verify`는 다음을 순차 실행합니다.

- `pnpm test`
- `pnpm planning:v2:complete`
- 추가 게이트가 스크립트에 존재하면 실행:
  - `pnpm planning:v2:compat`
  - `pnpm planning:v2:regress`

선택:

- `pnpm planning:v2:regress`
- 서버 실행 후 `PLANNING_BASE_URL=http://localhost:3100 pnpm planning:v2:acceptance`

## Prepare

버전 준비:

1. `pnpm release:prepare -- --bump=patch` (또는 `minor`, `major`)
2. 스크립트 동작:
   - `release:verify` 선실행
   - `pnpm version <bump> --no-git-tag-version` 실행
   - `CHANGELOG.md` 존재 보장 및 신규 버전 스텁 추가
   - `package.json` 내 `--version=x.y.z` 파라미터 동기화
3. `CHANGELOG.md` 스텁을 실제 변경사항으로 보강

## Tag & Rollback

태그 규칙:

- 커밋: `chore(release): vX.Y.Z`
- 태그: `vX.Y.Z`

롤백:

1. 직전 안정 태그로 코드 복구
2. `/ops/backup` 백업 복원
3. `/ops/doctor` 상태 확인
4. 필요 시 migration 복구 (`planning:v2:migrate:*`)
5. `pnpm release:verify` 재실행

상세 체크 항목은 [RELEASE_CHECKLIST.md](../RELEASE_CHECKLIST.md)를 기준으로 합니다.
