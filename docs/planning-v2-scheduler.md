# Planning v2 Scheduler Templates

## 공통 전제
- 실행 위치: 프로젝트 루트
- 로그 디렉토리: `.data/planning/ops/logs/`
- 스케줄러 이벤트 로그: `.data/planning/ops/logs/scheduler.ndjson`
- 스케줄러 임계치 정책 파일: `.data/planning/ops/scheduler-policy.json`
- 로그 경로 오버라이드(선택): `PLANNING_OPS_SCHEDULER_LOG_PATH`
- 임계치 정책 경로 오버라이드(선택): `PLANNING_OPS_SCHEDULER_POLICY_PATH`
- 연속 실패 임계치(선택):
  - `PLANNING_OPS_SCHEDULER_WARN_CONSECUTIVE` (기본 1)
  - `PLANNING_OPS_SCHEDULER_RISK_CONSECUTIVE` (기본 3)
  - 정책 파일이 있으면 파일 값이 우선이고, 파일이 없을 때 ENV 기본값을 사용합니다.
- 권장 시간대: `Asia/Seoul`
- 서버 cron 없이 로컬 스케줄러(Task Scheduler/cron)에서 CLI를 직접 실행합니다.
- 두 스크립트(`ops:refresh-assumptions`, `planning:run:monthly`)는 HTTP가 아니라 서버 모듈을 직접 호출합니다.
- Vault가 잠겨 있으면 즉시 실패하고 `code=LOCKED`로 종료합니다(종료코드 2).
- 운영 기준:
  - 월간 가정 갱신: `pnpm ops:refresh-assumptions`
  - 월간 기본 실행: `pnpm planning:run:monthly`
  - 주간(일요일 오전): `pnpm planning:v2:ops:safety:weekly`
  - 격주/월간: `pnpm planning:v2:ops:safety:regress`
- 월간 정리: `pnpm planning:v2:ops:prune --keep=50`
- 월간 점검(선택): `pnpm planning:v2:migrate:dry`
- 래퍼 스크립트(권장): `scripts/planning_v2_ops_scheduler.sh <weekly|regress|monthly|prune>`
  - 실행 결과를 `scheduler.ndjson`에 누적 기록합니다.
  - 실행 후 `planning:v2:ops:scheduler:health`를 자동 호출해 위험 누적을 점검합니다.
  - 위험 누적 진입/해제는 `SCHEDULED_TASK(taskName=OPS_SCHEDULER_HEALTH)` 이벤트로 기록됩니다.
  - 실패 시 `notify-send`가 있으면 로컬 알림을 시도합니다.
  - OPS 대시보드에서 `/api/ops/scheduler`로 최근 상태를 조회해 표시합니다.
  - 대시보드 카드에 연속 실패 횟수(주의/위험 배지)가 표시됩니다.
  - 대시보드 카드에서 `주의/위험` 임계치를 수정하면 정책 파일로 저장됩니다.
  - 대시보드 카드의 `ENV 기본값으로 초기화`로 정책 파일을 제거하고 ENV 기본값으로 되돌릴 수 있습니다.
  - 대시보드 카드에 `마지막 성공/실패 시각`과 `scheduler.log/scheduler.err` tail 미리보기가 표시됩니다.
  - 카드의 `audit 보기` 링크로 `/ops/audit?eventType=SCHEDULED_TASK&taskName=OPS_SCHEDULER_HEALTH` 필터를 바로 열 수 있습니다.
  - `/ops/audit`의 `임계치 변경 이력만 보기` 버튼으로 `OPS_SCHEDULER_POLICY_UPDATE` 로그를 바로 확인할 수 있습니다.
  - Audit 표의 `변경 요약` 컬럼에서 WARN/RISK 임계치의 전/후값(`before -> after`)을 확인할 수 있습니다.
  - Audit 필터에서 `임계치 증가만/감소만/동일값만`으로 변경 이력을 좁혀 볼 수 있습니다.
  - OPS 대시보드 스케줄러 카드에 `최근 임계치 변경 히스토리`가 함께 표시됩니다.
  - 브라우저 알림은 위험(`RISK`) 레벨에서만 발생합니다.
  - API:
    - `GET /api/ops/scheduler?limit=6&includeLogs=1&logLines=5`
    - `POST /api/ops/scheduler` (`csrf`, `warnConsecutiveFailures`, `riskConsecutiveFailures`)로 임계치를 저장합니다.
    - `POST /api/ops/scheduler` (`csrf`, `resetToEnvDefaults=true`)로 임계치 정책 파일을 초기화합니다.

## Windows (작업 스케줄러 / PowerShell 1줄)
- 월간 가정 갱신 + 실행(매월 1일 09:00 예시):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "cd 'C:\path\to\repo'; New-Item -ItemType Directory -Force '.data\planning\ops\logs' | Out-Null; pnpm ops:refresh-assumptions 1>>.data\planning\ops\logs\monthly.log 2>>.data\planning\ops\logs\monthly.err; pnpm planning:run:monthly 1>>.data\planning\ops\logs\monthly.log 2>>.data\planning\ops\logs\monthly.err"
```
- 주간 실행(일요일 09:00 예시):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "cd 'C:\path\to\repo'; New-Item -ItemType Directory -Force '.data\planning\ops\logs' | Out-Null; pnpm planning:v2:ops:safety:weekly 1>>.data\planning\ops\logs\ops.log 2>>.data\planning\ops\logs\ops.err"
```
- 격주/월간 회귀(2주 간격 트리거 예시):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "cd 'C:\path\to\repo'; New-Item -ItemType Directory -Force '.data\planning\ops\logs' | Out-Null; pnpm planning:v2:ops:safety:regress 1>>.data\planning\ops\logs\ops.log 2>>.data\planning\ops\logs\ops.err"
```
- 월간 정리:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "cd 'C:\path\to\repo'; pnpm planning:v2:ops:prune --keep=50"
```
- 실패 알림(선택, 로컬 이벤트 로그):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "cd 'C:\path\to\repo'; pnpm planning:v2:ops:safety:weekly; if ($LASTEXITCODE -ne 0) { eventcreate /T ERROR /ID 9723 /L APPLICATION /SO PlanningV2 /D \"planning:v2:ops:safety:weekly failed\" }"
```

## macOS (cron/launchd 템플릿)
- 월간 가정 갱신 + 실행(매월 1일 09:00):
```bash
0 9 1 * * cd /path/to/repo && mkdir -p .data/planning/ops/logs && pnpm ops:refresh-assumptions >> .data/planning/ops/logs/monthly.log 2>> .data/planning/ops/logs/monthly.err && pnpm planning:run:monthly >> .data/planning/ops/logs/monthly.log 2>> .data/planning/ops/logs/monthly.err
```
- 주간 실행(일요일 09:00):
```bash
0 9 * * 0 cd /path/to/repo && mkdir -p .data/planning/ops/logs && pnpm planning:v2:ops:safety:weekly >> .data/planning/ops/logs/ops.log 2>> .data/planning/ops/logs/ops.err
```
- 격주/월간 회귀:
```bash
0 9 1,15 * * cd /path/to/repo && mkdir -p .data/planning/ops/logs && pnpm planning:v2:ops:safety:regress >> .data/planning/ops/logs/ops.log 2>> .data/planning/ops/logs/ops.err
```
- 실패 알림(선택):
```bash
0 9 * * 0 cd /path/to/repo && mkdir -p .data/planning/ops/logs && pnpm planning:v2:ops:safety:weekly >> .data/planning/ops/logs/ops.log 2>> .data/planning/ops/logs/ops.err || osascript -e 'display notification "planning:v2:ops:safety:weekly failed" with title "Planning v2"'
```

## Linux (cron/systemd timer 템플릿)
- 권장: 아래 명령 대신 래퍼 스크립트를 직접 등록해 `scheduler.ndjson` 이벤트 로그를 남깁니다.
```bash
0 9 * * 0 /bin/bash /path/to/repo/scripts/planning_v2_ops_scheduler.sh weekly
0 9 1,15 * * /bin/bash /path/to/repo/scripts/planning_v2_ops_scheduler.sh regress
0 9 1 * * /bin/bash /path/to/repo/scripts/planning_v2_ops_scheduler.sh monthly
10 9 1 * * /bin/bash /path/to/repo/scripts/planning_v2_ops_scheduler.sh prune
```

- 월간 가정 갱신 + 실행(매월 1일 09:00):
```bash
0 9 1 * * cd /path/to/repo && mkdir -p .data/planning/ops/logs && pnpm ops:refresh-assumptions >> .data/planning/ops/logs/monthly.log 2>> .data/planning/ops/logs/monthly.err && pnpm planning:run:monthly >> .data/planning/ops/logs/monthly.log 2>> .data/planning/ops/logs/monthly.err
```
- 주간 실행(일요일 09:00):
```bash
0 9 * * 0 cd /path/to/repo && mkdir -p .data/planning/ops/logs && pnpm planning:v2:ops:safety:weekly >> .data/planning/ops/logs/ops.log 2>> .data/planning/ops/logs/ops.err
```
- 격주/월간 회귀:
```bash
0 9 1,15 * * cd /path/to/repo && mkdir -p .data/planning/ops/logs && pnpm planning:v2:ops:safety:regress >> .data/planning/ops/logs/ops.log 2>> .data/planning/ops/logs/ops.err
```
- 실패 알림(선택, notify-send 설치 시):
```bash
0 9 * * 0 cd /path/to/repo && mkdir -p .data/planning/ops/logs && pnpm planning:v2:ops:safety:weekly >> .data/planning/ops/logs/ops.log 2>> .data/planning/ops/logs/ops.err || (command -v notify-send >/dev/null 2>&1 && notify-send "Planning v2" "ops safety weekly failed")
```

## 월간 정리 명령
```bash
cd /path/to/repo && pnpm planning:v2:ops:prune --keep=50
cd /path/to/repo && pnpm planning:v2:migrate:dry
```

## 실행 결과 확인(Doctor/Metrics)
1. `/ops/metrics`에서 `SCHEDULED_TASK` 이벤트를 필터로 확인합니다.
   - `taskName=OPS_REFRESH_ASSUMPTIONS`
   - `taskName=PLANNING_RUN_MONTHLY`
2. `/ops/doctor`에서 아래 경고를 확인합니다.
   - `Recent successful run`
   - `Scheduled monthly run failures`
3. 반복 실패 시 코드별 조치:
   - `LOCKED`: `/ops/security`에서 unlock 후 재실행
   - `STALE_ASSUMPTIONS`: `pnpm ops:refresh-assumptions` 먼저 실행
