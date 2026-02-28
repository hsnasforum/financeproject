# Planning v2 Scheduler Templates

## 공통 전제
- 실행 위치: 프로젝트 루트
- 로그 디렉토리: `.data/planning/ops/logs/`
- 기본 명령:
  - `pnpm planning:v2:ops:run`
  - `pnpm planning:v2:ops:run:regress` (주 1회 권장)
  - `pnpm planning:v2:ops:prune -- --keep=50` (월 1회 권장)

## Windows (작업 스케줄러 / PowerShell 1줄)
- 일일 실행:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "cd 'C:\path\to\repo'; New-Item -ItemType Directory -Force '.data\planning\ops\logs' | Out-Null; pnpm planning:v2:ops:run 1>>.data\planning\ops\logs\ops.log 2>>.data\planning\ops\logs\ops.err"
```
- 주간 회귀 포함:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "cd 'C:\path\to\repo'; New-Item -ItemType Directory -Force '.data\planning\ops\logs' | Out-Null; pnpm planning:v2:ops:run:regress 1>>.data\planning\ops\logs\ops.log 2>>.data\planning\ops\logs\ops.err"
```
- 실패 알림(선택, 로컬 이벤트 로그):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "cd 'C:\path\to\repo'; pnpm planning:v2:ops:run; if ($LASTEXITCODE -ne 0) { eventcreate /T ERROR /ID 9723 /L APPLICATION /SO PlanningV2 /D \"planning:v2:ops:run failed\" }"
```

## macOS (cron/launchd 명령 템플릿)
- 일일 실행:
```bash
0 9 * * * cd /path/to/repo && mkdir -p .data/planning/ops/logs && pnpm planning:v2:ops:run >> .data/planning/ops/logs/ops.log 2>> .data/planning/ops/logs/ops.err
```
- 실패 알림(선택):
```bash
0 9 * * * cd /path/to/repo && mkdir -p .data/planning/ops/logs && pnpm planning:v2:ops:run >> .data/planning/ops/logs/ops.log 2>> .data/planning/ops/logs/ops.err || osascript -e 'display notification "planning:v2:ops:run failed" with title "Planning v2"'
```

## Linux (cron/systemd timer 명령 템플릿)
- 일일 실행:
```bash
0 9 * * * cd /path/to/repo && mkdir -p .data/planning/ops/logs && pnpm planning:v2:ops:run >> .data/planning/ops/logs/ops.log 2>> .data/planning/ops/logs/ops.err
```
- 실패 알림(선택, notify-send 설치 시):
```bash
0 9 * * * cd /path/to/repo && mkdir -p .data/planning/ops/logs && pnpm planning:v2:ops:run >> .data/planning/ops/logs/ops.log 2>> .data/planning/ops/logs/ops.err || (command -v notify-send >/dev/null 2>&1 && notify-send "Planning v2" "ops run failed")
```

## 로그 회전/정리
- 로그 파일 월간 회전(예시):
```bash
cd /path/to/repo && mkdir -p .data/planning/ops/logs && [ -f .data/planning/ops/logs/ops.log ] && mv .data/planning/ops/logs/ops.log ".data/planning/ops/logs/ops-$(date +%Y%m).log" || true
```
- 리포트/로그 보관 정리:
```bash
cd /path/to/repo && pnpm planning:v2:ops:prune -- --keep=50
```

