# 2026-06-28 P2-02 canonical root plan

## 변경 파일
- `work/6/28/2026-06-28-p2-02-canonical-root-plan.md`

## 사용 skill
- `finance-skill-routing`: 오늘 최신 `/work`와 이번 round 성격이 analysis-only인지 먼저 구분하고 필요한 skill 조합을 최소로 좁히는 데 사용했습니다.
- `planning-gate-selector`: canonical root, typecheck 범위, desktop artifact 검증 변경에 맞는 최소 검증 세트를 고르는 데 사용했습니다.
- `work-log-closeout`: planning round 종료 기록 형식과 필수 섹션을 저장소 규칙에 맞추는 데 사용했습니다.

## 변경 이유
- P2-02 목표는 planning v3의 canonical library root를 `src/lib/planning/v3`로 통일하고, 루트 `planning/v3`는 CLI entrypoint만 남기도록 경계를 정리하는 것입니다.
- 현재 저장소에는 `planning/v3`와 `src/lib/planning/v3`가 거의 같은 규모로 공존하고, `src/lib/planning/v3` 안에도 루트 `planning/v3`를 다시 가리키는 deep relative re-export shim이 다수 남아 있습니다.
- `tsconfig.planning.json`은 아직 v3를 include하지 않고 exclude하고 있어, canonical root 통일 후 typecheck 범위를 어떻게 소유할지 함께 결정해야 합니다.
- desktop artifact build/provenance 경로는 `src`, `scripts`, `.next/standalone` 전체를 복사하므로, v3 CLI/Next tracing inventory 누락 여부를 같이 확인해야 합니다.

## 직접 변경
- 코드 수정 없이 최신 `/work`, 관련 skill 문서, `package.json`, `tsconfig.planning.json`, `planning/v3`, `src/lib/planning/v3`, desktop artifact/provenance 스크립트를 읽고 P2-02 구현 범위를 분해했습니다.
- `planning/v3` 파일 수 158개, `src/lib/planning/v3` 파일 수 149개라는 현재 이중화 규모를 확인했습니다.
- `src/lib/planning/v3` 안의 deep relative re-export 또는 역참조가 news/indicators/exposure/journal/routines/scenarios/financeNews 계열에 남아 있음을 확인했습니다.
- `src/lib/news/alerts.ts`, `src/lib/news/stressContext.ts`, 일부 v3 tests/service가 여전히 루트 `planning/v3/*`를 직접 참조해 canonical root 전환 시 외부 소비자 정리가 필요함을 확인했습니다.
- desktop artifact provenance는 기존 `artifactChecksum` 검증은 있으나, v3 CLI entrypoint/Next tracing inventory를 별도 SSOT로 확인하는 테스트는 아직 없음을 확인했습니다.

## 검증
- 실행:
  - `Get-ChildItem -Path work -Recurse -File -Filter *.md | Sort-Object LastWriteTime -Descending | Select-Object -First 10 FullName,LastWriteTime`
  - `Get-Content work/6/28/2026-06-28-p2-01-runstore-read-purity.md -TotalCount 220`
  - `Get-Content work/6/28/2026-06-28-p2-01-runstore-read-boundary-plan.md -TotalCount 220`
  - `Get-Content work/6/28/2026-06-28-p1-08-dist-provenance-plan.md -TotalCount 220`
  - `Get-Content .codex/skills/finance-skill-routing/SKILL.md -TotalCount 260`
  - `Get-Content .codex/skills/planning-gate-selector/SKILL.md -TotalCount 260`
  - `Get-Content .codex/skills/work-log-closeout/SKILL.md -TotalCount 260`
  - `Get-Content multi_agent.md -TotalCount 260`
  - `Get-Content package.json -TotalCount 260`
  - `Get-Content tsconfig.planning.json -TotalCount 260`
  - `Get-ChildItem planning/v3 -Directory | Select-Object Name`
  - `Get-ChildItem src/lib/planning/v3 -Directory | Select-Object Name`
  - `rg -n '../../../../../planning/v3|../../../../../../planning/v3' src/lib/planning/v3 -g '*.ts'`
  - `rg -n 'planning/v3/' tests src/lib src/app scripts -g '*.ts' -g '*.tsx' -g '*.mjs'`
  - `(rg --files planning/v3 | Measure-Object).Count; (rg --files src/lib/planning/v3 | Measure-Object).Count`
  - `Get-Content planning/v3/ops/doctor.ts -TotalCount 220`
  - `Get-Content planning/v3/report/weeklyHtml.ts -TotalCount 160`
  - `Get-Content planning/v3/ops/refreshAll.ts -TotalCount 200`
  - `Get-Content scripts/planning_v2_desktop_build.mjs -TotalCount 260`
  - `Get-Content scripts/planning_v2_desktop_smoke.mjs -TotalCount 260`
  - `Get-Content scripts/planning_v2_desktop_provenance.mjs -TotalCount 260`
  - `Get-Content tests/desktop-artifact-provenance.test.ts -TotalCount 240`
  - `Get-Content src/lib/news/alerts.ts -TotalCount 120`
- 미실행:
  - `corepack pnpm typecheck`
  - `corepack pnpm lint`
  - `corepack pnpm v3:doctor`
  - `corepack pnpm planning:v2:desktop:build`
  - `corepack pnpm planning:v2:desktop:smoke`

## 남은 리스크
- canonical root를 한 번에 이동하면 `planning/v3` 내부 상대경로 import, `src/lib/news/*` 같은 외부 소비자, tests의 루트 참조가 함께 깨질 가능성이 큽니다.
- `typecheck:planning`을 v3까지 확장할지, 별도 `typecheck:v3`를 둘지 아직 결정되지 않았습니다. 범위를 잘못 잡으면 기존 planning v2 gate 소유권이 흐려질 수 있습니다.
- desktop artifact는 현재 checksum/provenance 중심이라, v3 CLI entrypoint와 Next standalone tracing 파일 목록이 실제 artifact에 포함되는지 별도 inventory assertion이 더 필요합니다.
- `planning/v3/ops/*`와 `planning/v3/report/weeklyHtml.ts`는 현재 루트 구현을 직접 사용하므로, CLI 전용 wrapper와 library 구현을 어디서 나눌지 먼저 정하지 않으면 파일 이동 후 되돌림 비용이 커질 수 있습니다.
