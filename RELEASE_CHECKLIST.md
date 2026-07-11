# RELEASE CHECKLIST

로컬 기준 릴리즈 반복 절차입니다.

## 1) Preconditions

- [ ] `git status`가 의도한 변경만 포함하는지 확인 (불필요 파일 제외)
- [ ] `main` 최신 상태 반영 (`git fetch` + `git pull --ff-only`)
- [ ] 로컬 환경 준비 (`pnpm install`)

## 2) Required Gates

- [ ] `pnpm test`
- [ ] `pnpm planning:v2:complete`
- [ ] `pnpm multi-agent:guard`
- [ ] `pnpm release:verify` 실행 및 PASS 확인
- [ ] `pnpm planning:v2:freeze:guard` 결과가 `v2 core change`면 추가 리뷰 메모 작성
- [ ] `v2 core change`일 때 리뷰 문맥에 `[v2-core-change]` 태그 추가

선택 게이트:

- [ ] `pnpm planning:v2:regress`
- [ ] 서버 실행 후 `PLANNING_BASE_URL=http://localhost:3100 pnpm planning:v2:acceptance`

## 3) Version Bump

- [ ] `pnpm release:prepare -- --bump=patch` (또는 `minor` / `major`)
- [ ] `CHANGELOG.md`의 신규 `vX.Y.Z` 스텁 내용을 실제 변경사항으로 채움
- [ ] 버전이 반영되었는지 확인:
  - [ ] `package.json`
  - [ ] `package.json` 내 `--version=x.y.z` 스크립트 파라미터

## 4) Tagging Convention

- [ ] 커밋: `chore(release): vX.Y.Z`
- [ ] 태그: `vX.Y.Z`
- [ ] 태그가 `package.json` 버전과 정확히 일치하는지 확인
- [ ] 태그 커밋이 최신 원격 `main`의 조상인지 확인
- [ ] `v*` protected tag/ruleset이 release owner만 태그를 만들도록 제한하는지 확인
- [ ] release hardening 이전 과거 커밋에는 새 태그를 만들지 않았는지 확인
- [ ] 푸시:
  - [ ] `git push origin <branch>`
  - [ ] `git push origin vX.Y.Z`
- [ ] Release workflow의 `Required release verification`과 `Build desktop artifact`가 PASS인지 확인
- [ ] 게시 asset이 `planning-v2-desktop-vX.Y.Z.tar.gz`, `.inventory.json`, `.manifest.json` 3개인지 확인
- [ ] manifest의 source SHA·toolchain·lockfile·artifact/archive/inventory checksum과 file count를 확인
- [ ] 같은 태그의 기존 GitHub Release가 없는지 확인; 있으면 덮어쓰지 말고 중단
- [ ] workflow 실패 시 Release와 asset이 생성되지 않았는지 확인

## 5) Rollback Notes

- [ ] 배포 전 `/ops/backup`으로 백업 파일 생성
- [ ] 문제 시 순서:
  1. 직전 안정 태그로 코드 되돌림
  2. `/ops/backup`에서 백업 복원
  3. `/ops/doctor`에서 migration/스토리지 상태 확인
  4. 필요 시 `pnpm planning:v2:migrate:dry` 후 `pnpm planning:v2:migrate:apply`
  5. `pnpm release:verify` 재실행
