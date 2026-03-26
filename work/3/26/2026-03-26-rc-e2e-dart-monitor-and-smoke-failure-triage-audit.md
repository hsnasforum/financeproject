# 2026-03-26 rc e2e dart-monitor-and-smoke failure triage audit

## 변경 파일
- `work/3/26/2026-03-26-rc-e2e-dart-monitor-and-smoke-failure-triage-audit.md`

## 사용 skill
- `planning-gate-selector`: triage/audit 라운드에 필요한 최소 검증 세트를 유지하기 위해 사용.
- `route-ssot-check`: `/public/dart`, `/recommend`가 현재 public surface인지 확인하고 route/href를 건드리지 않는 기준을 고정하기 위해 사용.
- `dart-data-source-hardening`: DART surface의 실패 모드와 첫 실패 증거를 triage 기준으로 분리하기 위해 사용.
- `work-log-closeout`: 이번 라운드의 실제 실행 명령과 결론을 `/work` 형식으로 정리하기 위해 사용.

## 변경 이유
- 직전 `pnpm e2e:rc` red 3건이 이번 `planning/v3` copy/handoff 배치의 직접 회귀인지, 기존 red baseline 또는 webserver/infrastructure 문제인지 먼저 분리할 필요가 있었다.
- 첫 실패인 `tests/e2e/dart-flow.spec.ts:60`과 뒤이은 smoke `ECONNREFUSED`를 같은 원인으로 단정하지 않기 위해 지정된 재현 순서로 다시 확인했다.

## 핵심 변경
- 코드와 route/href는 수정하지 않고 triage audit만 수행했다.
- `docs/current-screens.md` 기준으로 `/public/dart`, `/recommend`가 실존 public surface임을 재확인했다.
- `pnpm e2e:rc:dart`를 단독 재실행한 결과 `tests/e2e/dart-flow.spec.ts:60` 포함 3건이 모두 통과해 현재 시점의 `/public/dart` UI contract drift는 재현되지 않았다.
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/smoke.spec.ts --workers=1` 단독 재실행 결과 smoke 4건이 모두 통과해 `recommend`/`dart`의 개별 page regression도 재현되지 않았다.
- 초기 병렬 재현 시도에서는 두 프로세스가 같은 port `3126` webserver를 동시에 점유하려다 `EADDRINUSE`로 실패했다. 이는 triage 목적의 유효 증거가 아니므로 사용자가 지정한 순서대로 단독 재현으로 다시 판정했다.
- 이번 batch 직접 회귀: `[미확인]` 현재 재현 기준 없음. carry-forward unrelated red baseline 또는 일시적 webserver 경합 가능성을 우선 기록한다.

## 검증
- `pnpm e2e:rc:dart`
  - 결과: PASS
  - 비고: `tests/e2e/dart-flow.spec.ts:60` 포함 3건 통과.
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/smoke.spec.ts --workers=1`
  - 결과: PASS
  - 비고: `recommend page renders`, `dart page shows missing index guidance when index absent` 포함 4건 통과.
- `git diff --check -- work/3/26/2026-03-26-rc-e2e-dart-monitor-and-smoke-failure-triage-audit.md`

## 남은 리스크
- 이전 실패에 첨부된 `trace.zip` 3건은 로컬에 `unzip`이 없어 내부 내용을 직접 열어보지 못했다. 현재는 순차 재현 PASS가 더 강한 최신 증거다.
- 병렬 재현 시 `3126` port 경합으로 `EADDRINUSE`가 발생했으므로, 여러 Playwright webserver를 동시에 띄우는 방식은 같은 red를 다시 만들 수 있다.
- `pnpm e2e:rc` full suite는 이번 라운드에서 다시 실행하지 않았다. 이번 라운드는 첫 실패와 smoke cascade를 분리하는 triage audit에 한정했고, 타 스펙까지 포함한 전체 안정성은 아직 재확인하지 않았다.
- 미실행 검증:
- `pnpm lint` 미실행. 코드 변경이 없어서 제외.
- `pnpm build` 미실행. 코드 변경이 없어서 제외.
- 관련 단위 테스트 미실행. 코드 변경이 없어서 제외.
- `pnpm e2e:rc` 미실행. full suite 재검증보다 실패 분리 목적의 좁은 재현이 우선이었기 때문.
