# Gov24 Sync 운영 가이드

보조금24 동기화는 사용자 요청과 분리해 백그라운드/스케줄러에서 실행하는 것을 권장합니다.
웹 서버를 띄우지 않아도 아래 명령으로 실행할 수 있습니다.

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

