# 2026-06-28 P0-P1 범위 분해 계획

## 변경 파일
- `work/6/28/2026-06-28-p0-p1-scope-plan.md`

## 사용 skill
- `planning-gate-selector`: P0/P1 범위별 최소 검증 세트와 메인 에이전트 단독 최종 게이트 원칙을 정리했습니다.
- `work-log-closeout`: `/work` 종료 기록의 표준 섹션과 기록 범위를 맞췄습니다.

## 변경 이유
- 구현 기준 문서와 현재 `main` HEAD의 차이를 먼저 확인하고, 차이가 있으면 우선순위를 다시 검증하라는 사용자 요구를 계획에 반영해야 했습니다.
- 문서 기준 커밋과 현재 `main` HEAD가 동일해 드리프트 재판정은 불필요했지만, P0 독립 PR 순서와 P1 선행조건, 운영 inventory, 테스트 선행 조건을 현재 저장소 기준으로 정리할 필요가 있었습니다.
- 최종 `pnpm build`, `pnpm e2e:rc`, production smoke는 메인 에이전트만 단독 실행해야 하므로 작업 분해에 소유권 제약을 포함해야 했습니다.

## 핵심 변경
- 문서 기준 커밋 `5e1cc1c901f9ad3925fb450a8446b192ed4bf8f5`와 현재 `main` HEAD가 일치함을 확인했습니다.
- 최신 `/work` 기준으로 `work/6/23/2026-06-23-auth-user-scope-next-round-plan.md`와 해당 검증 기록을 이어받았습니다.
- P0-01, P0-02, P0-03을 각각 독립 PR 선행 단위로 유지하고, 각 PR 시작 전 실패 회귀 테스트 또는 장애 주입 테스트를 먼저 추가하는 계획으로 고정했습니다.
- 운영 topology/env/legacy data inventory 확인, dirty worktree(`.dist`, `scripts`, `tmp`) 충돌 회피, 메인 에이전트 단독 최종 게이트 원칙을 계획에 명시했습니다.

## 검증
- `git rev-parse main`
- `git log --oneline -1 main`
- `Get-Content -Path 'C:/Users/HS/Downloads/financeproject_통합분석_구현워커_전달문.md' -Encoding utf8 -TotalCount 260`
- `Get-ChildItem -Path work/6/23 -Filter *.md | Sort-Object LastWriteTime -Descending | Select-Object -First 3 FullName,LastWriteTime`
- `Get-Content -Path 'work/6/23/2026-06-23-auth-user-scope-next-round-plan.md' -Encoding utf8 -TotalCount 260`
- `rg -n -e "PLANNING_NAMESPACE_ENABLED" -e "PLANNING_SINGLE_USER_MODE" -e "isPlanningNamespaceEnabled" -e "isPlanningAuthRequired" src docs .env.local.example tests`
- `rg -n -e "transactions/import/csv" -e "legacy" -e "stored" src/app src/lib tests`
- `rg -n -e "replace" -e "restore" -e "backup" src/app src/lib tests docs`
- `git status --short -uno | Select-Object -First 20`

## 남은 리스크
- 이번 라운드는 계획과 현황 확인만 수행했고, 테스트·빌드·장애 주입은 실행하지 않았습니다.
- 현재 worktree에 `.dist`, `scripts`, `tmp` 수정이 있어 P1 desktop artifact 및 release/ops 범위와 충돌 가능성이 있습니다.
- 운영 topology/env 값과 실제 legacy 데이터 분포는 코드 검색만으로는 확정할 수 없으므로 다음 라운드에서 inventory 확인이 필요합니다.
