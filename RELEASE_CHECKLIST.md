# RELEASE CHECKLIST

릴리즈 운영용 체크리스트(사람 실행 절차)입니다.  
기준 CI: `.github/workflows/ci.yml` 의 `verify` job.

## 1) CI Gate Alignment

아래 항목은 CI에서 실제로 실행됩니다.

- [ ] `pnpm validate:dumps:fixtures && pnpm data:doctor && pnpm dart:rules:gate && pnpm lint && pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm planning:v2:complete`
- [ ] `pnpm planning:v2:compat`
- [ ] `pnpm planning:v2:guard`
- [ ] `pnpm planning:v2:regress`
- [ ] `pnpm build`

릴리즈 전 로컬 단축 검증(필수 3게이트):

- [ ] `pnpm release:verify`  (`test` + `planning:v2:complete` + `planning:v2:compat`)

## 2) Release Prepare

- [ ] `pnpm release:prepare -- --version=x.y.z`
- [ ] `git diff` 확인: `package.json`, `docs/planning-v2-changelog.md`
- [ ] 릴리즈 노트/증빙 생성
  - [ ] `pnpm planning:v2:release:notes -- --version=x.y.z`
  - [ ] `pnpm planning:v2:release:evidence -- --version=x.y.z`
  - [ ] (선택) `pnpm planning:v2:final-report -- --version=x.y.z --base-url=http://localhost:3100`
  - [ ] `pnpm planning:v2:record -- --version=x.y.z --base-url=http://localhost:3100`

## 3) Tag & Publish

- [ ] `git add -A`
- [ ] `git commit -m "chore(release): vx.y.z"`
- [ ] `git tag vx.y.z`
- [ ] `git push origin <branch>`
- [ ] `git push origin vx.y.z`
- [ ] GitHub Release workflow(`.github/workflows/release.yml`) 성공 확인

## 4) Rollback (Backup + Migration State)

사전 원칙:

- [ ] 배포 직전 `/ops/backup`에서 백업 파일을 생성해 보관
- [ ] `/ops/doctor`에서 migration 상태가 `failed/pending`이 아닌지 확인

문제 발생 시:

1. 앱 버전을 직전 안정 태그로 되돌립니다.
2. `/ops/backup`에서 최신 백업을 `replace` 모드로 복원합니다.
3. migration 상태 확인:
   - 파일: `.data/planning/migrations/migrationState.json`
   - 또는 `/ops/doctor`에서 migration 이슈 확인
4. migration 보정이 필요하면:
   - `pnpm planning:v2:migrate:dry`
   - `pnpm planning:v2:migrate:apply` (confirm 필요)
5. 복구 후 최소 게이트 재확인:
   - `pnpm release:verify`

## 5) References

- `docs/planning-v2-release-checklist.md`
- `docs/troubleshooting.md`
- `docs/planning-v2-ops.md`

