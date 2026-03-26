# 2026-03-25 analysis_docs v3 next step kickoff plan

## 변경 파일
- `analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md`

## 사용 skill
- `planning-gate-selector`: 이번 라운드가 docs-only 계획 정리라는 점에 맞춰 `git diff --check -- ...`만 실행하는 최소 검증 세트를 고르기 위해 사용.
- `route-ssot-check`: `analysis_docs/v3`의 official entry 제안과 `docs/current-screens.md`의 실제 route inventory를 대조해 문서 간 관계를 정리하기 위해 사용.
- `work-log-closeout`: 오늘 planning 라운드의 실제 산출물, 검증, 남은 리스크를 `/work` 형식으로 남기기 위해 사용.

## 변경 이유
- `analysis_docs/v3/01`, `02`는 방향과 추천안을 잘 정리했지만, 바로 다음 구현 라운드에서 어떤 경로와 어떤 흐름만 고정할지 한 장으로 묶여 있지 않았다.
- 현재 저장소에는 `planning/v3` route가 넓게 열려 있어, official entry와 route inventory를 구분하지 않으면 다음 단계가 다시 broad v3 정리로 번질 위험이 있었다.
- 따라서 `Import-to-Planning Beta`를 실제 착수 가능한 `Phase 1 kickoff plan`으로 좁히는 문서가 필요했다.

## 핵심 변경
- `analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md`를 새로 추가해 `01`, `02`의 공통 결론을 실제 다음 단계 실행 순서로 재정리했다.
- official entry 4개 route, deep-link only route, 1차 메인 진입으로 올리지 않을 route를 구분해 적었다.
- 대표 사용자 흐름을 `transactions -> batches -> balances -> profile/drafts -> preflight/apply -> stable report` 한 개로 고정했다.
- `docs/current-screens.md`의 planning/v3 public beta inventory와 `analysis_docs/v3`의 official entry 제안은 서로 다른 층위라는 점을 명시했다.
- `docs/planning-v3-kickoff.md`의 broad epic과 `analysis_docs/v3`의 좁은 실행 기준 사이 관계를 정리했다.

## 검증
- `git diff --check -- analysis_docs/v3/03_financeproject_v3_다음단계_실행계획.md work/3/25/2026-03-25-analysis-docs-v3-next-step-kickoff-plan.md` — 통과
- [미실행] `pnpm lint` — 이번 라운드는 docs-only라 제외했다.
- [미실행] `pnpm test` — 이번 라운드는 docs-only라 제외했다.
- [미실행] `pnpm build` — 이번 라운드는 docs-only라 제외했다.
- [미실행] `pnpm planning:current-screens:guard` — route inventory 자체는 바꾸지 않았고, inventory와 official entry의 관계만 문서로 정리해 제외했다.

## 남은 리스크
- `analysis_docs/v3`와 `docs/planning-v3-kickoff.md`의 제품 framing 차이는 문서상 정리했지만, 이후 실제 팀 기준선 문서 하나로 합칠지 여부는 별도 판단이 필요하다.
- `/planning/v3/start`를 onboarding wrapper로 재정의할지, internal route로 둘지는 아직 확정하지 않았다.
- 현재는 official entry 계획만 잠갔고, 실제 페이지 구현/링크 정리/CTA alignment는 다음 구현 또는 docs-sync 라운드에서 이어져야 한다.
