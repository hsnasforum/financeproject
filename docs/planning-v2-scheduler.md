# Planning v2 Scheduler Templates

## 공통 전제
- 실행 위치: 프로젝트 루트
- 로그 디렉토리: `.data/planning/ops/logs/`
- 권장 시간대: `Asia/Seoul`
- 서버 cron 없이 로컬 스케줄러(Task Scheduler/cron)에서 CLI를 직접 실행합니다.
- 두 스크립트(`ops:refresh-assumptions`, `planning:run:monthly`)는 HTTP가 아니라 서버 모듈을 직접 호출합니다.
- Vault가 잠겨 있으면 즉시 실패하고 `code=LOCKED`로 종료합니다(종료코드 2).
- 운영 기준:
  - 월간 가정 갱신: `pnpm ops:refresh-assumptions`
  - 월간 기본 실행: `pnpm planning:run:monthly`
  - 주간(일요일 오전): `pnpm planning:v2:ops:run`
  - 격주/월간: `pnpm planning:v2:ops:run:regress`
  - 월간 정리: `pnpm planning:v2:ops:prune --keep=50`
  - 월간 점검(선택): `pnpm planning:v2:migrate:dry`

## Windows (작업 스케줄러 / PowerShell 1줄)
- 월간 가정 갱신 + 실행(매월 1일 09:00 예시):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "cd 'C:\path\to\repo'; New-Item -ItemType Directory -Force '.data\planning\ops\logs' | Out-Null; pnpm ops:refresh-assumptions 1>>.data\planning\ops\logs\monthly.log 2>>.data\planning\ops\logs\monthly.err; pnpm planning:run:monthly 1>>.data\planning\ops\logs\monthly.log 2>>.data\planning\ops\logs\monthly.err"
```
- 주간 실행(일요일 09:00 예시):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "cd 'C:\path\to\repo'; New-Item -ItemType Directory -Force '.data\planning\ops\logs' | Out-Null; pnpm planning:v2:ops:run 1>>.data\planning\ops\logs\ops.log 2>>.data\planning\ops\logs\ops.err"
```
- 격주/월간 회귀(2주 간격 트리거 예시):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "cd 'C:\path\to\repo'; New-Item -ItemType Directory -Force '.data\planning\ops\logs' | Out-Null; pnpm planning:v2:ops:run:regress 1>>.data\planning\ops\logs\ops.log 2>>.data\planning\ops\logs\ops.err"
```
- 월간 정리:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "cd 'C:\path\to\repo'; pnpm planning:v2:ops:prune --keep=50"
```
- 실패 알림(선택, 로컬 이벤트 로그):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "cd 'C:\path\to\repo'; pnpm planning:v2:ops:run; if ($LASTEXITCODE -ne 0) { eventcreate /T ERROR /ID 9723 /L APPLICATION /SO PlanningV2 /D \"planning:v2:ops:run failed\" }"
```

## macOS (cron/launchd 템플릿)
- 월간 가정 갱신 + 실행(매월 1일 09:00):
```bash
0 9 1 * * cd /path/to/repo && mkdir -p .data/planning/ops/logs && pnpm ops:refresh-assumptions >> .data/planning/ops/logs/monthly.log 2>> .data/planning/ops/logs/monthly.err && pnpm planning:run:monthly >> .data/planning/ops/logs/monthly.log 2>> .data/planning/ops/logs/monthly.err
```
- 주간 실행(일요일 09:00):
```bash
0 9 * * 0 cd /path/to/repo && mkdir -p .data/planning/ops/logs && pnpm planning:v2:ops:run >> .data/planning/ops/logs/ops.log 2>> .data/planning/ops/logs/ops.err
```
- 격주/월간 회귀:
```bash
0 9 1,15 * * cd /path/to/repo && mkdir -p .data/planning/ops/logs && pnpm planning:v2:ops:run:regress >> .data/planning/ops/logs/ops.log 2>> .data/planning/ops/logs/ops.err
```
- 실패 알림(선택):
```bash
0 9 * * 0 cd /path/to/repo && mkdir -p .data/planning/ops/logs && pnpm planning:v2:ops:run >> .data/planning/ops/logs/ops.log 2>> .data/planning/ops/logs/ops.err || osascript -e 'display notification "planning:v2:ops:run failed" with title "Planning v2"'
```

## Linux (cron/systemd timer 템플릿)
- 월간 가정 갱신 + 실행(매월 1일 09:00):
```bash
0 9 1 * * cd /path/to/repo && mkdir -p .data/planning/ops/logs && pnpm ops:refresh-assumptions >> .data/planning/ops/logs/monthly.log 2>> .data/planning/ops/logs/monthly.err && pnpm planning:run:monthly >> .data/planning/ops/logs/monthly.log 2>> .data/planning/ops/logs/monthly.err
```
- 주간 실행(일요일 09:00):
```bash
0 9 * * 0 cd /path/to/repo && mkdir -p .data/planning/ops/logs && pnpm planning:v2:ops:run >> .data/planning/ops/logs/ops.log 2>> .data/planning/ops/logs/ops.err
```
- 격주/월간 회귀:
```bash
0 9 1,15 * * cd /path/to/repo && mkdir -p .data/planning/ops/logs && pnpm planning:v2:ops:run:regress >> .data/planning/ops/logs/ops.log 2>> .data/planning/ops/logs/ops.err
```
- 실패 알림(선택, notify-send 설치 시):
```bash
0 9 * * 0 cd /path/to/repo && mkdir -p .data/planning/ops/logs && pnpm planning:v2:ops:run >> .data/planning/ops/logs/ops.log 2>> .data/planning/ops/logs/ops.err || (command -v notify-send >/dev/null 2>&1 && notify-send "Planning v2" "ops run failed")
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
