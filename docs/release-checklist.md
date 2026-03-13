# Release Checklist

## 사전 확인
- 기준 체크리스트는 루트 `RELEASE_CHECKLIST.md`
- `pnpm release:verify` 통과
  - 포함: `pnpm test`, `pnpm planning:v2:complete`, `pnpm multi-agent:guard`
  - script가 있으면 `pnpm planning:v2:compat`, `pnpm planning:v2:regress`도 이어서 실행
  - advisory `pnpm planning:ssot:check`는 WARN으로만 기록
- `pnpm build` 통과
- 사용자 경로/셀렉터 영향이 있으면 `pnpm e2e:rc` 통과
  - 범위가 넓거나 RC 밖 재현이 필요하면 `pnpm e2e`
- 문서 3종 최신화 확인
  - `docs/current-screens.md`
  - `docs/deploy.md`
  - `docs/release-notes.md`
- production에서 dev 기능 차단 확인
  - `/api/dev/*` 404
  - `/dev/*`, `/debug/unified`, `/dashboard/artifacts` 404

## 릴리즈 절차
1. `package.json` 버전 갱신 (예: `1.0.0`)
2. 릴리즈 커밋 생성
   - `git add ...`
   - `git commit -m "chore(release): v1.0.0"`
3. 태그 생성
   - `git tag v1.0.0`
4. 브랜치/태그 푸시
   - `git push origin main`
   - `git push origin v1.0.0`
5. GitHub Release 생성 확인
   - `.github/workflows/release.yml` 자동 실행 확인

## 롤백 절차
1. 문제 버전 태그 식별 (예: `v1.0.0`)
2. 직전 정상 태그/커밋으로 핫픽스 브랜치 생성
3. 수정 후 패치 버전 태그 발행 (예: `v1.0.2`)
4. 배포 환경은 `v1.0.2`로 재배포
5. 장애 원인/대응을 `docs/release-notes.md`에 기록
