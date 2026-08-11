# Gov24 Sync 운영 가이드

보조금24 동기화는 사용자 요청과 분리해 백그라운드/스케줄러에서 실행하는 것을 권장합니다.
웹 서버를 띄우지 않아도 아래 명령으로 실행할 수 있습니다.

## 실행 경계

- 공개 `/gov24`와 조회 API는 저장된 snapshot만 읽습니다.
- `POST /api/gov24/sync`는 동기화를 실행하지 않습니다. development/test에서는 `403 OPERATOR_COMMAND_REQUIRED`, production에서는 `404 NOT_FOUND`를 반환합니다.
- `ALLOW_LOCAL_SYNC`는 이 경계를 열지 않습니다.
- Dev doctor와 Ops action에서도 `GOV24_SYNC_IF_STALE`, `DAILY_REFRESH`를 HTTP로 실행하지 않습니다.
- 예약 갱신을 사용하는 경우 GitHub Actions Secrets에 `MOIS_BENEFITS_API_KEY`와 HTTPS 형식의 `MOIS_BENEFITS_API_URL`을 모두 설정해야 합니다.
- 실제 갱신은 저장소와 환경 설정에 접근할 수 있는 local-ops 또는 승인된 scheduler가 아래 CLI를 사용합니다.

## 수동 실행

```bash
pnpm gov24:sync
```

## 신선도 기준 실행(if-stale)

기준:
- 스냅샷 없음
- 스냅샷 생성 시각 24시간 초과
- completionRate < 0.95

```bash
pnpm gov24:sync:if-stale
```

## Windows Task Scheduler 예시

- 매일 04:00 실행 프로그램: `pnpm`
- 인수: `gov24:sync:if-stale`
- 시작 위치: 저장소 루트 경로

## Linux/macOS cron 예시

```cron
0 4 * * * cd <repo> && pnpm gov24:sync:if-stale
```

같은 저장 경로를 쓰는 Gov24 명령을 동시에 여러 개 실행하지 마세요. 완료 후 실행 중인 웹 서버는 snapshot 파일 identity 변경을 감지해 다음 조회에서 새 파일을 다시 읽습니다.
