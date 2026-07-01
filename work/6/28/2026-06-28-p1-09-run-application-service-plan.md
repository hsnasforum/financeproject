# 2026-06-28 P1-09 run application service 계획

## 변경 파일
- `work/6/28/2026-06-28-p1-09-run-application-service-plan.md`
- 코드 수정 없음

## 사용 skill
- `planning-gate-selector`: P1-09 범위가 planning v2 route/application 경계와 호환성 계약에 미치는 검증 세트를 좁히는 데 사용했습니다.
- `work-log-closeout`: `/work` 종료 기록의 섹션 순서와 필수 항목을 맞추는 데 사용했습니다.

## 변경 이유
- 사용자 요청은 P1-09의 구현 계획 수립이며, 코드 수정 없이 메인 소유 범위와 병렬 위임 가능 범위를 분리해야 했습니다.
- 기준 문서의 P1-09 섹션은 planning run 생성 유스케이스를 HTTP route에서 분리하고 alias route의 route-to-route 호출 제거를 요구합니다.
- 현재 브랜치 HEAD가 `d74f803812902d041478dbfc14c0a91c889af84b`와 같아 P1-09 착수 전 상태로 확인되었습니다.

## 핵심 변경
- 최신 `/work` 문서와 P1-09 기준 문서 섹션을 확인해 계획의 전제와 최신 검증 결과를 이어받았습니다.
- `src/app/api/planning/v2/runs/route.ts`, alias route 2개, `src/lib/planning/server/runs/routeService.ts`, 관련 테스트를 읽어 메인 소유 파일과 회귀 위험을 정리했습니다.
- alias route가 현재 `runs/route.ts`의 `POST`를 직접 import하고 있음을 확인했습니다.
- `tests/planning-v2-api/persistence-routes.test.ts`, `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`가 현재 구조를 문자열 단위로 고정하고 있어 메인 에이전트 소유 범위에 포함해야 함을 기록했습니다.

## 검증
- `Get-ChildItem -Path work -Recurse -File -Filter *.md | Sort-Object LastWriteTime -Descending | Select-Object -First 10 FullName,LastWriteTime`
- `Get-Content -Raw '.codex/skills/planning-gate-selector/SKILL.md'`
- `Get-Content -Raw -Encoding UTF8 'work/6/28/2026-06-28-p1-08-desktop-artifact-provenance.md'`
- `wsl bash -lc "python3 - <<'PY' ... P1-09 section extract ... PY"`
- `wsl bash -lc "git rev-parse --abbrev-ref HEAD && echo '---' && git rev-parse HEAD ..."`
- `wsl bash -lc "rg -n 'createPlanningRun|route-to-route|runsPost|runStagePipeline' src tests docs scripts"`
- `wsl bash -lc "sed -n '1,220p' src/app/api/planning/v2/runs/route.ts"`
- `wsl bash -lc "sed -n '1,120p' src/app/api/planning/run/route.ts && printf '\n---\n' && sed -n '1,120p' src/app/api/planning/v2/run/route.ts"`
- `wsl bash -lc "sed -n '1,260p' src/lib/planning/server/runs/routeService.ts"`
- `wsl bash -lc "sed -n '120,185p' tests/planning-v2-api/persistence-routes.test.ts"`
- `wsl bash -lc "sed -n '500,545p' tests/planning/auth/planningRouteUserScopeCoverage.test.ts"`
- `wsl bash -lc "sed -n '1,160p' tests/planning-v2-api/run-route.test.ts"`
- 테스트, lint, build 미실행: 이번 라운드는 계획 수립만 수행했습니다.

## 남은 리스크
- P1-09 구현 시 alias route 제거 방식이 `planningRouteUserScopeCoverage`의 proxy 예외/패턴과 충돌할 수 있습니다.
- `runs/route.ts` 내부 parser default, legacy scenario 변환 순서, `request.url` origin 기반 product matching 주입이 service 추출 중 달라질 위험이 있습니다.
- `planning:v2:regress`와 `planning:v2:compat`는 아직 실행하지 않았으므로 현재 계약 baseline이 실제로 얼마나 민감한지는 미확인 상태입니다.
