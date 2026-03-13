# 2026-03-13 planning-v3 news-indicators residue rerun batch plan

## 변경 파일
- 코드 수정 없음
- `work/3/13/2026-03-13-planning-v3-news-indicators-residue-rerun-batch-plan.md`

## 사용 skill
- `planning-gate-selector`: 후보 배치별 최소 검증을 다시 좁히는 데 사용
- `work-log-closeout`: 이번 재분해 결과를 `/work` 형식으로 남기는 데 사용

## 변경 이유
- 사용자 요청은 구현이 아니라 `planning-v3 news-indicators residue next-batch breakdown` 재실행이다.
- 범위 제한으로 `runtime release-verify` 축과 기존 `news route/root-contract closeout` 축은 다시 열지 않는다.
- 현재 dirty subset을 다시 묶어 다음 실제 구현 1축만 추천할 필요가 있었다.

## 핵심 변경
- 최신 `/work`와 현재 dirty 경로를 다시 확인해 residue를 4개 후보 배치로 재분해했다.
- 재오픈 금지 축으로 `planning/v3/news/cli/newsRefresh.ts`, `planning/v3/news/recovery.ts`, `planning/v3/news/rootDir.ts`, `planning/v3/news/store/index.ts`, `src/app/api/planning/v3/news/digest|refresh|recovery/route.ts`, `tests/planning-v3-news-refresh-recovery-remote-host-api.test.ts`, `tests/planning-v3-news-digest-indicator-root.test.ts`를 계속 잠갔다.
- 다음 후보 배치는 `indicators connector harness`, `indicators specs import/root contract`, `news read-only surface`, `news write/settings surface` 4개로 유지했다.
- 다음 실제 구현 1축은 가장 작은 internal-only 배치인 `indicators connector harness hardening`으로 추천했다.

## 검증
- 기준선/문맥 확인
  - `sed -n '1,220p' .codex/skills/planning-gate-selector/SKILL.md`
  - `sed -n '1,220p' .codex/skills/work-log-closeout/SKILL.md`
  - `ls -lt work/3/13/*.md | sed -n '1,12p'`
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-news-indicators-residue-next-batch-breakdown.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-news-route-same-origin-contract-followup.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-news-refresh-root-contract-followup.md`
- 현재 residue 잠금
  - `git status --short -- planning/v3/alerts planning/v3/indicators planning/v3/news src/app/api/planning/v3/news src/app/api/planning/v3/indicators src/app/planning/v3/news tests/planning-v3-news-*.test.ts tests/planning-v3-news-*.test.tsx tests/planning-v3-indicators-*.test.ts tests/planning-v3-indicators-*.test.tsx`
  - `git diff --name-only -- planning/v3/alerts planning/v3/indicators planning/v3/news src/app/api/planning/v3/news src/app/api/planning/v3/indicators src/app/planning/v3/news tests/planning-v3-news-*.test.ts tests/planning-v3-news-*.test.tsx tests/planning-v3-indicators-*.test.ts tests/planning-v3-indicators-*.test.tsx`

## 남은 리스크
- `news write/settings surface`는 아직 넓다. 실제 구현에 들어가면 `alerts/settings`와 `notes/weekly-plan`을 한 번 더 자를 수 있다.
- `news read-only surface`는 사용자 영향이 커서 다음에 열면 `build`까지 포함한 검증이 필요하다.
- 이번 라운드는 계획 재정리만 수행했으므로 `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`는 실행하지 않았다.

## 이번 라운드 완료 항목
- 최신 `/work`와 현재 dirty subset을 기준으로 residue 재분해를 다시 잠갔다.
- 제외 범위인 `runtime release-verify`, `news route/root-contract` 재오픈 금지를 명시했다.
- 다음 구현 1축으로 `indicators connector harness hardening`을 확정 추천했다.

## 다음 라운드 우선순위
1. `indicators connector harness hardening`
2. `indicators specs import/root contract`
3. `news read-only surface`
4. `news write/settings surface`
