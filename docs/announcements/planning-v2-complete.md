# Planning v2 완료(로컬 개인용)

## 핵심 요약 (5줄)
- Planning v2는 목표/현금흐름/부채를 기반으로 시뮬레이션, 확률(몬테카를로), 실행 액션 제안을 제공합니다.
- assumptions snapshot(최신/히스토리) 기준으로 실행해 데이터 최신성 점검과 재동기화 흐름을 갖췄습니다.
- 실행 결과는 run + snapshotId 기준으로 저장/재현 가능하며, runs/reports 화면에서 추적할 수 있습니다.
- 운영은 `/ops/*`에서 상태 점검, 정리, 회귀/게이트(`complete`, `regress`)로 관리합니다.
- 범위 밖(v3): 계좌연동/마이데이터, 정밀 세금/연금, optimizer 정식 기능화, 멀티유저/기본 암호화.

## 완료 기록
- Version: `0.1.0`
- Completed At (UTC): `2026-03-01T08:47:59.874Z`
- Final Report: `docs/releases/planning-v2-final-report-0.1.0.md`
- Release Notes: `docs/releases/planning-v2-0.1.0.md`
- Evidence Bundle: `.data/planning/release/planning-v2-evidence-0.1.0.tar.gz`

## 사용자 URL
- `/planning`
- `/planning/runs`
- `/planning/reports`

## 운영 URL
- `/ops/assumptions`
- `/ops/planning`
- `/ops/planning-cache`
- `/ops/planning-cleanup`

## 실행 커맨드 (복붙)
```bash
pnpm planning:v2:complete
pnpm planning:v2:acceptance
pnpm planning:v2:ops:run
pnpm planning:v2:ops:run:regress
```

`planning:v2:acceptance`는 서버 실행 후 사용합니다.

## 문서 링크
- [Quickstart](../planning-v2-quickstart.md)
- [Onepage](../planning-v2-onepage.md)
- [User](../planning-v2-user.md)
- [Ops](../planning-v2-ops.md)
- [Done Definition](../planning-v2-done-definition.md)
- [Freeze](../planning-v2-freeze.md)
- [Release Checklist](../planning-v2-release-checklist.md)

## 완성 판정
- `pnpm planning:v2:complete` 실행 시 아래 문구가 출력될 때만 완료로 판정합니다.
- `✅ P97 COMPLETE — 모든 게이트 통과(테스트/스모크/가드/회귀)`
