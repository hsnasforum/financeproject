# Release Checklist

## 사전 확인
- 기준 체크리스트는 루트 `RELEASE_CHECKLIST.md`
- stable final single-owner gate의 primary인 `pnpm release:verify` 통과
  - 포함: `pnpm test`, `pnpm planning:v2:complete`, `pnpm multi-agent:guard`
  - script가 있으면 `pnpm planning:v2:compat`, `pnpm planning:v2:regress`도 이어서 실행
  - advisory `pnpm planning:ssot:check`는 WARN으로만 기록
- stable final single-owner gate의 companion인 `pnpm build` 통과
- 사용자 경로/셀렉터 영향이 있으면 stable final single-owner gate의 companion인 `pnpm e2e:rc` 통과
  - 범위가 넓거나 RC 밖 재현이 필요하면 `pnpm e2e`
- `pnpm planning:v2:guard`, `pnpm planning:v2:engine:guard`는 planning v2 architecture/security/engine contract를 직접 건드린 release에서만 conditional blocker로 붙이고, 실행 결과는 release closeout에 남긴다.
- `pnpm planning:v2:freeze:guard`는 informational evidence이므로 advisory record로만 남긴다.
- `pnpm e2e:rc:dart`, `pnpm e2e:rc:data-sources`는 scoped stable subset gate로만 쓰고, full stable RC의 `pnpm e2e:rc`를 대체하지 않는다.
- beta targeted Playwright와 `pnpm v3:doctor`/`pnpm v3:support-bundle`/`pnpm v3:restore`/`pnpm v3:migrate` 같은 ops/dev 명령은 stable release blocker에 자동 포함하지 않는다.
- `pnpm planning:v2:ops:run*`, `pnpm planning:v2:ops:safety*`, `pnpm planning:v2:ops:scheduler:health`, `pnpm planning:v2:ops:prune`는 release closeout이 아니라 scheduler/ops log 또는 `/work` evidence로 남긴다.
- 문서 3종 최신화 확인
  - `docs/current-screens.md`
  - `docs/deploy.md`
  - `docs/release-notes.md`
- production에서 dev 기능 차단 확인
  - `/api/dev/*` 404
  - `/dev/*`, `/debug/unified`, `/dashboard/artifacts` 404

## 릴리즈 closeout 기록
- tracked `/work` release closeout note 작성
- primary / companion final gate 결과 기록
  - `pnpm release:verify`
  - `pnpm build`
  - `pnpm e2e:rc` (`실행한 경우만`)
- conditional minor guard 기록
  - 실행한 `pnpm planning:v2:guard`, `pnpm planning:v2:engine:guard`
  - 왜 붙였는지와 결과
- advisory record 분리
  - `pnpm planning:ssot:check`
  - `pnpm planning:v2:freeze:guard`
  - subset gate / 기타 non-blocking 결과
- 미실행 gate와 이유 기록
- evidence 위치 기록
  - scheduler/ops raw evidence는 `.data/planning/ops/logs/scheduler.ndjson`, `.data/planning/ops/logs/*.log`, `.data/planning/ops/reports/*.json`
- residual risk / next owner 기록
- 예시가 필요하면 아래 두 note 패턴을 우선 따른다.
  - 성공형: `work/3/16/2026-03-16-release-v1.0.4-main-verify.md`
  - blocker/smoke형: `work/3/13/2026-03-13-runtime-release-verify-smoke.md`

## release note quality gate
- 새 tracked release closeout note는 `docs/release.md`의 current template 섹션을 모두 채운다.
- blocker 결과와 advisory/evidence 결과를 같은 블록에 섞지 않는다.
- raw log/json/support bundle 본문을 복사하지 않고 경로와 요약만 남긴다.
- 미실행 gate와 이유를 빠뜨리지 않는다.
- residual risk / next owner를 비워 두지 않는다.
- `advisory record`, `evidence 위치`, `미실행 gate`에 적을 내용이 없더라도 섹션을 생략하지 않고 `- 없음`으로 남긴다.
- 실제 결과에 맞는 exemplar를 고른다.
  - final gate가 통과한 release bound closeout이면 성공형 exemplar
  - 첫 blocker와 미실행 gate를 함께 남기는 smoke/triage면 blocker/smoke exemplar
- 명령, 경로, 결과 표기는 실제 실행값과 일치하게 적는다.
- first compliant exemplar는 `work/3/19/2026-03-19-release-v1.0.4-main-verify.md`로 본다.
- legacy exemplar는 역할 참고용 기준선으로 유지하고, fully compliant exemplar가 생겨도 즉시 교체하지 않는다.
  - 성공형 역할 reference: `work/3/16/2026-03-16-release-v1.0.4-main-verify.md`
  - blocker/smoke 역할 reference: `work/3/13/2026-03-13-runtime-release-verify-smoke.md`
- exemplar 역할은 3층으로 읽는다.
  - template adoption 기준선: `work/3/19/2026-03-19-release-v1.0.4-main-verify.md`
  - success historical role reference: `work/3/16/2026-03-16-release-v1.0.4-main-verify.md`
  - blocker/smoke historical role reference: `work/3/13/2026-03-13-runtime-release-verify-smoke.md`
- success exemplar 교체 review는 다음 stable release-bound closeout 1건이 더 생기고, 그 note가 fully compliant이면서 success handoff reference로 더 읽기 쉬울 때만 연다.
- blocker exemplar 교체 review는 새 blocked/smoke closeout이 fully compliant이고 첫 blocker + 미실행 gate 분리가 더 선명할 때만 연다.

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
