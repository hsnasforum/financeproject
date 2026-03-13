# Release Checklist

## 사전 확인
- `pnpm verify` 통과
- 멀티 에이전트 설정/프롬프트/skill 변경이 있으면 `pnpm multi-agent:guard` 통과
- `pnpm build` 통과
- `pnpm e2e` 통과
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
